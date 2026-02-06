import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

type Booking = {
  id: string;
  client_id: string;
  sitter_id: string;
  amount: number;
  platform_fee: number;
  sitter_payout: number;
  stripe_payment_intent_id: string | null;
  status: string;
  created_at: string;
};

const AdminDisputes = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const loadDisputes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketplace_bookings")
      .select("*")
      .eq("status", "disputed")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setBookings((data as Booking[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDisputes();
  }, []);

  const resolveDispute = async (bookingId: string, action: "release" | "refund") => {
    setLoading(true);
    const { error } = await supabase.functions.invoke("process-dispute-resolution", {
      body: { bookingId, action },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(action === "release" ? "Funds released" : "Refund issued");
      await loadDisputes();
    }
    setLoading(false);
  };

  if (profile?.user_role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dispute List</h1>
        <Button variant="outline" onClick={loadDisputes} disabled={loading}>
          Refresh
        </Button>
      </div>

      {bookings.length === 0 ? (
        <div className="text-sm text-muted-foreground">No disputed bookings.</div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="border rounded-lg p-4 bg-card">
              <div className="text-sm">
                <div><strong>ID:</strong> {b.id}</div>
                <div><strong>Client:</strong> {b.client_id}</div>
                <div><strong>Sitter:</strong> {b.sitter_id}</div>
                <div><strong>Amount:</strong> {b.amount}</div>
                <div><strong>Status:</strong> {b.status}</div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  className="bg-primary text-white"
                  onClick={() => resolveDispute(b.id, "release")}
                  disabled={loading}
                >
                  Release Funds to Sitter
                </Button>
                <Button
                  variant="outline"
                  onClick={() => resolveDispute(b.id, "refund")}
                  disabled={loading}
                >
                  Refund Pet Parent
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDisputes;
