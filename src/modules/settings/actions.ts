"use server";

import { revalidatePath } from "next/cache";
import { assertAdminRead, assertAdminWrite } from "@/shared/auth/assert";
import {
  EMPLOYEE_FUND_FLAG_KEY,
  isEmployeeFundForceOff,
  type EmployeeFundFlagState,
} from "@/shared/lib/feature-flags";
import {
  actionFail,
  actionOk,
  formatActionError,
  type ActionResult,
} from "@/shared/lib/action-result";
import { ROUTES } from "@/shared/navigation/routes";
import { createServerSupabase } from "@/shared/supabase/server";
import { getEmployeeFundFlagState } from "./query";

export async function fetchEmployeeFundFlag(): Promise<ActionResult<EmployeeFundFlagState>> {
  try {
    await assertAdminRead();
    const state = await getEmployeeFundFlagState();
    return actionOk(state);
  } catch (err) {
    return actionFail(formatActionError(err, "Không tải được Feature Flag."));
  }
}

export async function setEmployeeFundFlag(
  enabled: boolean,
): Promise<ActionResult<EmployeeFundFlagState>> {
  try {
    await assertAdminWrite();
    if (typeof enabled !== "boolean") {
      return actionFail("Giá trị Feature Flag không hợp lệ.");
    }

    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("pos_set_app_setting_bool", {
      p_key: EMPLOYEE_FUND_FLAG_KEY,
      p_value: enabled,
    });
    if (error) {
      return actionFail(error.message || "Không lưu được Feature Flag.");
    }

    revalidatePath(ROUTES.settings);
    const state = await getEmployeeFundFlagState();

    if (enabled && isEmployeeFundForceOff()) {
      return actionOk({ ...state, dbEnabled: true, forceOff: true, enabled: false });
    }
    return actionOk(state);
  } catch (err) {
    return actionFail(formatActionError(err, "Không lưu được Feature Flag."));
  }
}
