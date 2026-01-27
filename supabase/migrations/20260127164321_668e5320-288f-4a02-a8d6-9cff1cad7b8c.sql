-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  legal_name TEXT, -- Hidden from public
  phone TEXT,
  gender_genre TEXT,
  dob DATE,
  height INT,
  weight INT,
  weight_unit TEXT DEFAULT 'kg',
  degree TEXT,
  school TEXT,
  affiliation TEXT,
  pet_experience TEXT[] DEFAULT '{}',
  experience_years INT DEFAULT 0,
  relationship_status TEXT,
  has_car BOOLEAN DEFAULT FALSE,
  languages TEXT[] DEFAULT '{}',
  location_name TEXT,
  user_role TEXT DEFAULT 'free',
  is_verified BOOLEAN DEFAULT FALSE,
  bio TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create pets table
CREATE TABLE public.pets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  breed TEXT,
  gender TEXT,
  weight INT,
  weight_unit TEXT DEFAULT 'kg',
  dob DATE,
  vaccinations JSONB DEFAULT '[]'::jsonb,
  medications JSONB DEFAULT '[]'::jsonb,
  routine TEXT,
  temperament TEXT[] DEFAULT '{}',
  vet_contact TEXT,
  microchip_id TEXT,
  bio TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notice_board table
CREATE TABLE public.notice_board (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Social', 'Charity', 'Help', 'Donations', 'Neighborhood News')),
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create map_alerts table
CREATE TABLE public.map_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('Stray', 'Lost', 'Found')),
  description TEXT,
  photo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  support_count INT DEFAULT 0,
  report_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create alert_interactions table for support/report/hide tracking
CREATE TABLE public.alert_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES public.map_alerts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('support', 'report', 'hide', 'block_user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(alert_id, user_id, interaction_type)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_interactions ENABLE ROW LEVEL SECURITY;

-- Create a public view for profiles (excludes sensitive fields)
CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
  id,
  display_name,
  gender_genre,
  dob,
  height,
  weight,
  weight_unit,
  pet_experience,
  experience_years,
  relationship_status,
  has_car,
  languages,
  location_name,
  user_role,
  is_verified,
  bio,
  avatar_url,
  created_at
FROM public.profiles;

-- PROFILES RLS POLICIES
-- Users can read public profile info (through view) or their own full profile
CREATE POLICY "Users can view own full profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow reading other profiles for public view
CREATE POLICY "Anyone can view profiles for public view"
  ON public.profiles FOR SELECT
  USING (true);

-- PETS RLS POLICIES
CREATE POLICY "Anyone can view public pets"
  ON public.pets FOR SELECT
  USING (is_public = true OR owner_id = auth.uid());

CREATE POLICY "Users can insert own pets"
  ON public.pets FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own pets"
  ON public.pets FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own pets"
  ON public.pets FOR DELETE
  USING (owner_id = auth.uid());

-- NOTICE_BOARD RLS POLICIES
CREATE POLICY "Anyone can view notices"
  ON public.notice_board FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert notices"
  ON public.notice_board FOR INSERT
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can update own notices"
  ON public.notice_board FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Users can delete own notices"
  ON public.notice_board FOR DELETE
  USING (author_id = auth.uid());

-- MAP_ALERTS RLS POLICIES
CREATE POLICY "Anyone can view active alerts"
  ON public.map_alerts FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can insert alerts"
  ON public.map_alerts FOR INSERT
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can update own alerts"
  ON public.map_alerts FOR UPDATE
  USING (creator_id = auth.uid());

CREATE POLICY "Users can delete own alerts"
  ON public.map_alerts FOR DELETE
  USING (creator_id = auth.uid());

-- ALERT_INTERACTIONS RLS POLICIES
CREATE POLICY "Users can view own interactions"
  ON public.alert_interactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert interactions"
  ON public.alert_interactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own interactions"
  ON public.alert_interactions FOR DELETE
  USING (user_id = auth.uid());

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pets_updated_at
  BEFORE UPDATE ON public.pets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for auto-creating profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for avatars and pet photos
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('pets', 'pets', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('alerts', 'alerts', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('notices', 'notices', true);

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for pets
CREATE POLICY "Pet images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pets');

CREATE POLICY "Users can upload pet images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update pet images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete pet images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'pets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for alerts
CREATE POLICY "Alert images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'alerts');

CREATE POLICY "Users can upload alert images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'alerts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for notices
CREATE POLICY "Notice images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notices');

CREATE POLICY "Users can upload notice images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'notices' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable realtime for map_alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.map_alerts;