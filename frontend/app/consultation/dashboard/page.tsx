import { redirect } from "next/navigation";

/** Legacy route — sidebar and permissions use `/consultation` as the hub. */
export default function ConsultationDashboardRedirect() {
  redirect("/consultation");
}
