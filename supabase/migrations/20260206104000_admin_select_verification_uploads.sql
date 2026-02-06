-- Allow admins to view verification uploads for review
CREATE POLICY "Admins can view verification uploads"
  ON public.verification_uploads
  FOR SELECT
  USING (auth.uid() IN (SELECT id FROM public.profiles WHERE user_role = 'admin'));
