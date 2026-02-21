export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alert_interactions: {
        Row: {
          alert_id: string
          created_at: string | null
          id: string
          interaction_type: string
          user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string | null
          id?: string
          interaction_type: string
          user_id: string
        }
        Update: {
          alert_id?: string
          created_at?: string | null
          id?: string
          interaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_interactions_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "map_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_alerts: {
        Row: {
          address: string | null
          created_at: string
          creator_id: string
          description: string | null
          duration_hours: number
          geog: unknown | null
          id: string
          latitude: number
          longitude: number
          photo_url: string | null
          post_on_threads: boolean
          range_km: number
          thread_id: string | null
          title: string | null
          type: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          duration_hours: number
          geog?: unknown | null
          id?: string
          latitude: number
          longitude: number
          photo_url?: string | null
          post_on_threads?: boolean
          range_km: number
          thread_id?: string | null
          title?: string | null
          type: string
        }
        Update: {
          address?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          duration_hours?: number
          geog?: unknown | null
          id?: string
          latitude?: number
          longitude?: number
          photo_url?: string | null
          post_on_threads?: boolean
          range_km?: number
          thread_id?: string | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_alerts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_alerts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      map_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          creator_id: string
          description: string | null
          id: string
          is_active: boolean | null
          latitude: number
          longitude: number
          photo_url: string | null
          report_count: number | null
          support_count: number | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          creator_id: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          latitude: number
          longitude: number
          photo_url?: string | null
          report_count?: number | null
          support_count?: number | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          creator_id?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number
          longitude?: number
          photo_url?: string | null
          report_count?: number | null
          support_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "map_alerts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_alerts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_board: {
        Row: {
          author_id: string
          category: string
          content: string
          created_at: string | null
          id: string
          image_url: string | null
        }
        Insert: {
          author_id: string
          category: string
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
        }
        Update: {
          author_id?: string
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notice_board_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notice_board_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          bio: string | null
          breed: string | null
          created_at: string | null
          dob: string | null
          gender: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          medications: Json | null
          microchip_id: string | null
          name: string
          owner_id: string
          photo_url: string | null
          routine: string | null
          species: string
          temperament: string[] | null
          updated_at: string | null
          vaccinations: Json | null
          vet_contact: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          bio?: string | null
          breed?: string | null
          created_at?: string | null
          dob?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          medications?: Json | null
          microchip_id?: string | null
          name: string
          owner_id: string
          photo_url?: string | null
          routine?: string | null
          species: string
          temperament?: string[] | null
          updated_at?: string | null
          vaccinations?: Json | null
          vet_contact?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          bio?: string | null
          breed?: string | null
          created_at?: string | null
          dob?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          medications?: Json | null
          microchip_id?: string | null
          name?: string
          owner_id?: string
          photo_url?: string | null
          routine?: string | null
          species?: string
          temperament?: string[] | null
          updated_at?: string | null
          vaccinations?: Json | null
          vet_contact?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          affiliation: string | null
          availability_status: string[] | null
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          degree: string | null
          display_name: string | null
          dob: string | null
          experience_years: number | null
          gender_genre: string | null
          has_car: boolean | null
          height: number | null
          id: string
          languages: string[] | null
          legal_name: string | null
          location_name: string | null
          major: string | null
          tier: string | null
          effective_tier: string | null
          last_active_at: string | null
          onboarding_completed: boolean | null
          owns_pets: boolean | null
          pet_experience: string[] | null
          phone: string | null
          relationship_status: string | null
          school: string | null
          show_academic: boolean | null
          show_affiliation: boolean | null
          show_age: boolean | null
          show_bio: boolean | null
          show_gender: boolean | null
          show_height: boolean | null
          show_weight: boolean | null
          social_availability: boolean | null
          updated_at: string | null
          user_role: string | null
          verification_comment: string | null
          verification_status: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          affiliation?: string | null
          availability_status?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          degree?: string | null
          display_name?: string | null
          dob?: string | null
          experience_years?: number | null
          gender_genre?: string | null
          has_car?: boolean | null
          height?: number | null
          id: string
          languages?: string[] | null
          legal_name?: string | null
          location_name?: string | null
          major?: string | null
          tier?: string | null
          effective_tier?: string | null
          last_active_at?: string | null
          onboarding_completed?: boolean | null
          owns_pets?: boolean | null
          pet_experience?: string[] | null
          phone?: string | null
          relationship_status?: string | null
          school?: string | null
          show_academic?: boolean | null
          show_affiliation?: boolean | null
          show_age?: boolean | null
          show_bio?: boolean | null
          show_gender?: boolean | null
          show_height?: boolean | null
          show_weight?: boolean | null
          social_availability?: boolean | null
          updated_at?: string | null
          user_role?: string | null
          verification_comment?: string | null
          verification_status?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          affiliation?: string | null
          availability_status?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          degree?: string | null
          display_name?: string | null
          dob?: string | null
          experience_years?: number | null
          gender_genre?: string | null
          has_car?: boolean | null
          height?: number | null
          id?: string
          languages?: string[] | null
          legal_name?: string | null
          location_name?: string | null
          major?: string | null
          tier?: string | null
          effective_tier?: string | null
          last_active_at?: string | null
          onboarding_completed?: boolean | null
          owns_pets?: boolean | null
          pet_experience?: string[] | null
          phone?: string | null
          relationship_status?: string | null
          school?: string | null
          show_academic?: boolean | null
          show_affiliation?: boolean | null
          show_age?: boolean | null
          show_bio?: boolean | null
          show_gender?: boolean | null
          show_height?: boolean | null
          show_weight?: boolean | null
          social_availability?: boolean | null
          updated_at?: string | null
          user_role?: string | null
          verification_comment?: string | null
          verification_status?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          affiliation: string | null
          availability_status: string[] | null
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          degree: string | null
          display_name: string | null
          dob: string | null
          experience_years: number | null
          gender_genre: string | null
          has_car: boolean | null
          height: number | null
          id: string | null
          languages: string[] | null
          location_name: string | null
          major: string | null
          owns_pets: boolean | null
          pet_experience: string[] | null
          relationship_status: string | null
          school: string | null
          social_availability: boolean | null
          user_role: string | null
          verification_status: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          affiliation?: never
          availability_status?: string[] | null
          avatar_url?: string | null
          bio?: never
          created_at?: string | null
          degree?: never
          display_name?: string | null
          dob?: never
          experience_years?: number | null
          gender_genre?: never
          has_car?: boolean | null
          height?: never
          id?: string | null
          languages?: string[] | null
          location_name?: string | null
          major?: never
          owns_pets?: boolean | null
          pet_experience?: string[] | null
          relationship_status?: string | null
          school?: never
          social_availability?: boolean | null
          user_role?: string | null
          verification_status?: never
          weight?: never
          weight_unit?: string | null
        }
        Update: {
          affiliation?: never
          availability_status?: string[] | null
          avatar_url?: string | null
          bio?: never
          created_at?: string | null
          degree?: never
          display_name?: string | null
          dob?: never
          experience_years?: number | null
          gender_genre?: never
          has_car?: boolean | null
          height?: never
          id?: string | null
          languages?: string[] | null
          location_name?: string | null
          major?: never
          owns_pets?: boolean | null
          pet_experience?: string[] | null
          relationship_status?: string | null
          school?: never
          social_availability?: boolean | null
          user_role?: string | null
          verification_status?: never
          weight?: never
          weight_unit?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_visible_broadcast_alerts: {
        Args: {
          p_lat: number
          p_lng: number
        }
        Returns: {
          id: string
          latitude: number
          longitude: number
          alert_type: string
          title: string | null
          description: string | null
          photo_url: string | null
          support_count: number
          report_count: number
          created_at: string
          expires_at: string | null
          range_meters: number
          creator_id: string | null
          thread_id: string | null
          creator_display_name: string | null
          creator_avatar_url: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
