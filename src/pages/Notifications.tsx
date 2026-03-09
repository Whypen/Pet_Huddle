// /notifications is preserved as a route for DB deep-link compatibility.
// The actual notification UI now lives in GlobalHeader's left-side drawer.
import { Navigate } from "react-router-dom";

export default function NotificationsPage() {
  return <Navigate to="/" replace />;
}
