-- Ensure admin update policy matches required SQL
alter policy "Admins can update all bookings"
on public.marketplace_bookings
using (auth.jwt() ->> 'role' = 'admin');
