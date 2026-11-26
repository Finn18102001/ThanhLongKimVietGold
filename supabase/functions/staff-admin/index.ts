import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type StaffAction =
  | {
      action: "create";
      fullName: string;
      email: string;
      phone?: string | null;
      role: "ADMIN" | "ADMIN_VIEWER" | "STAFF";
      note?: string | null;
      password: string;
    }
  | { action: "setActive"; id: string; isActive: boolean }
  | { action: "delete"; id: string; deleteAuth?: boolean }
  | {
      action: "resetPassword";
      id: string;
      password: string;
      /** Required when target staff.role = ADMIN (verify before overwrite). */
      currentPassword?: string;
    };

type StaffRow = {
  auth_user_id?: string | null;
  email?: string | null;
  role?: string | null;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Missing Supabase env" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: isAdmin, error: adminError } = await userClient.rpc("tlkv_is_admin");
    if (adminError || !isAdmin) {
      return json({ error: "Không đủ quyền thực hiện." }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const payload = (await req.json()) as StaffAction;

    if (payload.action === "create") {
      const email = payload.email.trim().toLowerCase();
      const password = payload.password;
      if (!email || !payload.fullName?.trim()) {
        return json({ error: "Thiếu họ tên hoặc email" }, 400);
      }
      if (!password || password.length < 7) {
        return json({ error: "Mật khẩu tối thiểu 7 ký tự" }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: payload.fullName.trim() },
        app_metadata: { role: payload.role },
      });
      if (createError || !created.user) {
        return json({ error: createError?.message ?? "Không tạo được tài khoản Auth" }, 400);
      }

      const { data, error } = await userClient.rpc("pos_create_staff", {
        p_full_name: payload.fullName.trim(),
        p_email: email,
        p_phone: payload.phone ?? null,
        p_role: payload.role,
        p_note: payload.note ?? null,
        p_auth_user_id: created.user.id,
        p_is_active: true,
      });
      if (error) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: error.message }, 400);
      }
      return json(data);
    }

    if (payload.action === "setActive") {
      const { data: staffRes, error: getError } = await userClient.rpc("pos_get_staff", {
        p_id: payload.id,
      });
      if (getError) return json({ error: getError.message }, 400);
      const authUserId = (staffRes as { staff?: StaffRow })?.staff?.auth_user_id;

      const { data, error } = await userClient.rpc("pos_set_staff_active", {
        p_id: payload.id,
        p_is_active: payload.isActive,
      });
      if (error) return json({ error: error.message }, 400);

      if (authUserId) {
        await admin.auth.admin.updateUserById(authUserId, {
          ban_duration: payload.isActive ? "none" : "876000h",
        });
      }
      return json(data);
    }

    if (payload.action === "resetPassword") {
      if (!payload.password || payload.password.length < 7) {
        return json({ error: "Mật khẩu tối thiểu 7 ký tự" }, 400);
      }
      const { data: staffRes, error: getError } = await userClient.rpc("pos_get_staff", {
        p_id: payload.id,
      });
      if (getError) return json({ error: getError.message }, 400);
      const staff = (staffRes as { staff?: StaffRow })?.staff;
      const authUserId = staff?.auth_user_id;
      const staffEmail = (staff?.email ?? "").trim().toLowerCase();
      const staffRole = (staff?.role ?? "").trim().toUpperCase();
      if (!authUserId || !staffEmail) {
        return json({ error: "Nhân viên chưa gắn tài khoản đăng nhập" }, 400);
      }

      // ADMIN accounts: must prove current password before overwrite.
      // STAFF / ADMIN_VIEWER: acting admin may force-set a new password.
      if (staffRole === "ADMIN") {
        const currentPassword = (payload.currentPassword ?? "").trim();
        if (!currentPassword) {
          return json(
            { error: "Đổi mật khẩu tài khoản ADMIN bắt buộc nhập mật khẩu cũ." },
            400,
          );
        }
        const verifier = createClient(supabaseUrl, anonKey);
        const { error: verifyError } = await verifier.auth.signInWithPassword({
          email: staffEmail,
          password: currentPassword,
        });
        if (verifyError) {
          return json({ error: "Mật khẩu cũ không đúng." }, 400);
        }
        await verifier.auth.signOut();
      }

      const { error: pwdError } = await admin.auth.admin.updateUserById(authUserId, {
        password: payload.password,
      });
      if (pwdError) return json({ error: pwdError.message }, 400);
      return json({ ok: true });
    }

    if (payload.action === "delete") {
      const { data, error } = await userClient.rpc("pos_delete_staff", { p_id: payload.id });
      if (error) return json({ error: error.message }, 400);
      const authUserId = (data as { auth_user_id?: string | null })?.auth_user_id;
      if (payload.deleteAuth !== false && authUserId) {
        await admin.auth.admin.deleteUser(authUserId);
      }
      return json(data);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
