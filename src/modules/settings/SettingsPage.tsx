import { ModulePlaceholder } from "@/shared/ui/ModulePlaceholder";

export function SettingsPage() {
  return (
    <ModulePlaceholder
      moduleId="settings"
      title="Cài đặt"
      summary="Cấu hình hệ thống chỉ dành cho quản trị. Mọi thay đổi nhạy cảm phải có audit log."
    />
  );
}
