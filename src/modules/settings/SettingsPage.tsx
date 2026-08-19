import { ModulePlaceholder } from "@/shared/ui/ModulePlaceholder";

export function SettingsPage() {
  return (
    <ModulePlaceholder
      moduleId="settings"
      title="Cài đặt"
      summary="Cấu hình hệ thống chỉ dành cho quản trị viên. Mọi thay đổi quan trọng đều được ghi vào nhật ký hệ thống."
    />
  );
}
