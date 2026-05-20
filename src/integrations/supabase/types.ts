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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      abuse_signals: {
        Row: {
          active: boolean
          cooldown_until: string | null
          created_at: string
          id: string
          metadata: Json
          reason_internal: string | null
          review_required: boolean
          risk_level: string
          signal_hash: string
          signal_type: string
          source_user_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          cooldown_until?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason_internal?: string | null
          review_required?: boolean
          risk_level?: string
          signal_hash: string
          signal_type: string
          source_user_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          cooldown_until?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason_internal?: string | null
          review_required?: boolean
          risk_level?: string
          signal_hash?: string
          signal_type?: string
          source_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          notes: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          notes?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          notes?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_vet_conversations: {
        Row: {
          created_at: string | null
          id: string
          pet_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          pet_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          pet_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_vet_conversations_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_vet_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_vet_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_vet_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          media_analysis: Json | null
          media_url: string | null
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          media_analysis?: Json | null
          media_url?: string | null
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          media_analysis?: Json | null
          media_url?: string | null
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_vet_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_vet_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_vet_rate_limits: {
        Row: {
          last_refill: string
          tokens: number
          user_id: string
        }
        Insert: {
          last_refill?: string
          tokens?: number
          user_id: string
        }
        Update: {
          last_refill?: string
          tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_vet_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_vet_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_vet_usage: {
        Row: {
          conversation_count: number | null
          created_at: string | null
          id: string
          image_analysis_count: number | null
          message_count: number | null
          month: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conversation_count?: number | null
          created_at?: string | null
          id?: string
          image_analysis_count?: number | null
          message_count?: number | null
          month: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conversation_count?: number | null
          created_at?: string | null
          id?: string
          image_analysis_count?: number | null
          message_count?: number | null
          month?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_vet_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_vet_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
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
      banned_identifiers: {
        Row: {
          active: boolean
          created_at: string
          expires_at: string | null
          id: string
          identifier_hash: string
          identifier_type: string
          metadata: Json
          public_message: string
          reason_internal: string | null
          source_user_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          identifier_hash: string
          identifier_type: string
          metadata?: Json
          public_message?: string
          reason_internal?: string | null
          source_user_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          identifier_hash?: string
          identifier_type?: string
          metadata?: Json
          public_message?: string
          reason_internal?: string | null
          source_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blocked_identity_verifications: {
        Row: {
          active: boolean
          card_fingerprint_hash: string
          card_last4: string
          created_at: string
          id: string
          legal_name_hash: string
          metadata: Json
          source_user_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          card_fingerprint_hash: string
          card_last4: string
          created_at?: string
          id?: string
          legal_name_hash: string
          metadata?: Json
          source_user_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          card_fingerprint_hash?: string
          card_last4?: string
          created_at?: string
          id?: string
          legal_name_hash?: string
          metadata?: Json
          source_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_alert_interactions: {
        Row: {
          alert_id: string
          created_at: string
          id: string
          interaction_type: string
          user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          id?: string
          interaction_type: string
          user_id: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          id?: string
          interaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_alert_interactions_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "broadcast_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_alert_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_alert_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_alert_notification_queue: {
        Row: {
          alert_id: string
          alert_type: string
          attempt_count: number
          available_at: string
          created_at: string
          id: number
          last_error: string | null
          location_name: string | null
          processed_at: string | null
          recipient_user_id: string
          thread_id: string | null
        }
        Insert: {
          alert_id: string
          alert_type: string
          attempt_count?: number
          available_at?: string
          created_at?: string
          id?: number
          last_error?: string | null
          location_name?: string | null
          processed_at?: string | null
          recipient_user_id: string
          thread_id?: string | null
        }
        Update: {
          alert_id?: string
          alert_type?: string
          attempt_count?: number
          available_at?: string
          created_at?: string
          id?: number
          last_error?: string | null
          location_name?: string | null
          processed_at?: string | null
          recipient_user_id?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_alert_notification_queue_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "broadcast_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_alert_notification_queue_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_alert_notification_queue_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_alerts: {
        Row: {
          address: string | null
          archived_at: string | null
          created_at: string
          creator_id: string
          description: string | null
          duration_hours: number
          expires_at: string | null
          geog: unknown
          id: string
          images: string[]
          incident_admin_area: string | null
          incident_city: string | null
          incident_country_code: string | null
          incident_country_name: string | null
          incident_district: string | null
          incident_location_confidence: string | null
          incident_location_source: string | null
          is_sensitive: boolean
          latitude: number
          longitude: number
          photo_url: string | null
          post_on_threads: boolean
          range_km: number
          range_meters: number | null
          thread_id: string | null
          title: string | null
          type: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          duration_hours: number
          expires_at?: string | null
          geog?: unknown
          id?: string
          images?: string[]
          incident_admin_area?: string | null
          incident_city?: string | null
          incident_country_code?: string | null
          incident_country_name?: string | null
          incident_district?: string | null
          incident_location_confidence?: string | null
          incident_location_source?: string | null
          is_sensitive?: boolean
          latitude: number
          longitude: number
          photo_url?: string | null
          post_on_threads?: boolean
          range_km: number
          range_meters?: number | null
          thread_id?: string | null
          title?: string | null
          type: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          duration_hours?: number
          expires_at?: string | null
          geog?: unknown
          id?: string
          images?: string[]
          incident_admin_area?: string | null
          incident_city?: string | null
          incident_country_code?: string | null
          incident_country_name?: string | null
          incident_district?: string | null
          incident_location_confidence?: string | null
          incident_location_source?: string | null
          is_sensitive?: boolean
          latitude?: number
          longitude?: number
          photo_url?: string | null
          post_on_threads?: boolean
          range_km?: number
          range_meters?: number | null
          thread_id?: string | null
          title?: string | null
          type?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string | null
          id: string
          media_expires_at: string | null
          retention_frozen_until: string | null
          sender_id: string
          text_expires_at: string | null
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string | null
          id?: string
          media_expires_at?: string | null
          retention_frozen_until?: string | null
          sender_id: string
          text_expires_at?: string | null
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string | null
          id?: string
          media_expires_at?: string | null
          retention_frozen_until?: string | null
          sender_id?: string
          text_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          chat_id: string
          id: string
          is_muted: boolean | null
          joined_at: string | null
          last_read_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          chat_id: string
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_report_freezes: {
        Row: {
          chat_id: string
          created_at: string
          expires_at: string | null
          id: string
          report_id: string | null
          reported_message_id: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          report_id?: string | null
          reported_message_id?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          report_id?: string | null
          reported_message_id?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      chat_retention_locks: {
        Row: {
          chat_id: string
          created_at: string
          expires_at: string | null
          id: string
          locked_by: string | null
          media_path: string | null
          message_id: string | null
          reason: string
          released_at: string | null
          status: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          locked_by?: string | null
          media_path?: string | null
          message_id?: string | null
          reason: string
          released_at?: string | null
          status?: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          locked_by?: string | null
          media_path?: string | null
          message_id?: string | null
          reason?: string
          released_at?: string | null
          status?: string
        }
        Relationships: []
      }
      chat_room_members: {
        Row: {
          archived_at: string | null
          chat_id: string
          created_at: string | null
          deleted_at: string | null
          is_muted: boolean
          left_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          chat_id: string
          created_at?: string | null
          deleted_at?: string | null
          is_muted?: boolean
          left_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          chat_id?: string
          created_at?: string | null
          deleted_at?: string | null
          is_muted?: boolean
          left_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          avatar_url: string | null
          both_deleted_at: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          join_method: string | null
          last_active_at: string | null
          last_message_at: string | null
          last_opened_at: string | null
          location_country: string | null
          location_label: string | null
          name: string | null
          pet_focus: string[] | null
          report_freeze_status: string | null
          retention_status: string | null
          room_code: string | null
          type: string
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          avatar_url?: string | null
          both_deleted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          join_method?: string | null
          last_active_at?: string | null
          last_message_at?: string | null
          last_opened_at?: string | null
          location_country?: string | null
          location_label?: string | null
          name?: string | null
          pet_focus?: string[] | null
          report_freeze_status?: string | null
          retention_status?: string | null
          room_code?: string | null
          type: string
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          avatar_url?: string | null
          both_deleted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          join_method?: string | null
          last_active_at?: string | null
          last_message_at?: string | null
          last_opened_at?: string | null
          location_country?: string | null
          location_label?: string | null
          name?: string | null
          pet_focus?: string[] | null
          report_freeze_status?: string | null
          retention_status?: string | null
          room_code?: string | null
          type?: string
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_logs: {
        Row: {
          accepted_at: string
          consent_type: string
          consent_version: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          accepted_at?: string
          consent_type: string
          consent_version?: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          accepted_at?: string
          consent_type?: string
          consent_version?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_irs_eo_bmf_index: {
        Row: {
          active: boolean
          affiliation_code: string | null
          deductibility_code: string | null
          ein_hmac: string
          foundation_code: string | null
          id: string
          imported_at: string
          organization_name: string
          organization_name_normalized: string
          source_posting_date: string | null
          source_region: string | null
          source_url: string
          subsection_code: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          affiliation_code?: string | null
          deductibility_code?: string | null
          ein_hmac: string
          foundation_code?: string | null
          id?: string
          imported_at?: string
          organization_name: string
          organization_name_normalized: string
          source_posting_date?: string | null
          source_region?: string | null
          source_url?: string
          subsection_code?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          affiliation_code?: string | null
          deductibility_code?: string | null
          ein_hmac?: string
          foundation_code?: string | null
          id?: string
          imported_at?: string
          organization_name?: string
          organization_name_normalized?: string
          source_posting_date?: string | null
          source_region?: string | null
          source_url?: string
          subsection_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credential_private_config: {
        Row: {
          config_key: string
          config_value: string
          created_at: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credential_registry_sources: {
        Row: {
          active: boolean
          allow_public_masked_identifier: boolean
          automation_level: Database["public"]["Enums"]["credential_automation_level"]
          country_region: string
          created_at: string
          credential_type: string
          id: string
          safe_to_show_source_name: boolean
          source_key: string
          source_name: string
          source_type: Database["public"]["Enums"]["credential_source_type"]
          source_url: string | null
          updated_at: string
          usage_caveat: string
        }
        Insert: {
          active?: boolean
          allow_public_masked_identifier?: boolean
          automation_level: Database["public"]["Enums"]["credential_automation_level"]
          country_region: string
          created_at?: string
          credential_type: string
          id?: string
          safe_to_show_source_name?: boolean
          source_key: string
          source_name: string
          source_type: Database["public"]["Enums"]["credential_source_type"]
          source_url?: string | null
          updated_at?: string
          usage_caveat?: string
        }
        Update: {
          active?: boolean
          allow_public_masked_identifier?: boolean
          automation_level?: Database["public"]["Enums"]["credential_automation_level"]
          country_region?: string
          created_at?: string
          credential_type?: string
          id?: string
          safe_to_show_source_name?: boolean
          source_key?: string
          source_name?: string
          source_type?: Database["public"]["Enums"]["credential_source_type"]
          source_url?: string | null
          updated_at?: string
          usage_caveat?: string
        }
        Relationships: []
      }
      credential_verification_checks: {
        Row: {
          checked_at: string
          confidence: Database["public"]["Enums"]["credential_confidence"]
          created_at: string
          credential_id: string
          edge_function_run_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          lookup_inputs: Json
          match_result: Json
          matched_fields: Json
          raw_result_redacted: Json
          source_id: string | null
          status_after: Database["public"]["Enums"]["professional_credential_status"]
          status_before: Database["public"]["Enums"]["professional_credential_status"]
          user_id: string
        }
        Insert: {
          checked_at?: string
          confidence?: Database["public"]["Enums"]["credential_confidence"]
          created_at?: string
          credential_id: string
          edge_function_run_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lookup_inputs?: Json
          match_result?: Json
          matched_fields?: Json
          raw_result_redacted?: Json
          source_id?: string | null
          status_after: Database["public"]["Enums"]["professional_credential_status"]
          status_before: Database["public"]["Enums"]["professional_credential_status"]
          user_id: string
        }
        Update: {
          checked_at?: string
          confidence?: Database["public"]["Enums"]["credential_confidence"]
          created_at?: string
          credential_id?: string
          edge_function_run_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lookup_inputs?: Json
          match_result?: Json
          matched_fields?: Json
          raw_result_redacted?: Json
          source_id?: string | null
          status_after?: Database["public"]["Enums"]["professional_credential_status"]
          status_before?: Database["public"]["Enums"]["professional_credential_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_verification_checks_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "professional_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_verification_checks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "credential_registry_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_verification_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_verification_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_verification_evidence: {
        Row: {
          created_at: string
          credential_id: string
          evidence_type: string
          id: string
          redacted_metadata: Json
          storage_path: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          evidence_type: string
          id?: string
          redacted_metadata?: Json
          storage_path: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          evidence_type?: string
          id?: string
          redacted_metadata?: Json
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_verification_evidence_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "professional_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      device_fingerprint_history: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          matched_banned_user_id: string | null
          metadata: Json
          review_flag: boolean
          risk_flag: boolean
          updated_at: string
          user_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          matched_banned_user_id?: string | null
          metadata?: Json
          review_flag?: boolean
          risk_flag?: boolean
          updated_at?: string
          user_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          matched_banned_user_id?: string | null
          metadata?: Json
          review_flag?: boolean
          risk_flag?: boolean
          updated_at?: string
          user_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_fingerprint_history_matched_banned_user_id_fkey"
            columns: ["matched_banned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_fingerprint_history_matched_banned_user_id_fkey"
            columns: ["matched_banned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_chat_pairs: {
        Row: {
          chat_id: string
          created_at: string
          user_high: string
          user_low: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          user_high: string
          user_low: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          user_high?: string
          user_low?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_chat_pairs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_chat_pairs_user_high_fkey"
            columns: ["user_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_chat_pairs_user_high_fkey"
            columns: ["user_high"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_chat_pairs_user_low_fkey"
            columns: ["user_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_chat_pairs_user_low_fkey"
            columns: ["user_low"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      discover_match_seen: {
        Row: {
          matched_user_id: string
          seen_at: string
          viewer_id: string
        }
        Insert: {
          matched_user_id: string
          seen_at?: string
          viewer_id: string
        }
        Update: {
          matched_user_id?: string
          seen_at?: string
          viewer_id?: string
        }
        Relationships: []
      }
      emergency_logs: {
        Row: {
          alert_id: string | null
          created_at: string
          error_message: string | null
          event_type: string
          failure_count: number | null
          id: string
          metadata: Json | null
          recipients_count: number | null
          status: string
          success_count: number | null
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          failure_count?: number | null
          id?: string
          metadata?: Json | null
          recipients_count?: number | null
          status: string
          success_count?: number | null
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          failure_count?: number | null
          id?: string
          metadata?: Json | null
          recipients_count?: number | null
          status?: string
          success_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_logs_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "lost_pet_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string | null
          ended_at: string | null
          ended_by: string | null
          ended_reason: string | null
          id: string
          invitee_user_id: string
          inviter_user_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_reason?: string | null
          id?: string
          invitee_user_id: string
          inviter_user_id: string
          status: string
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ended_reason?: string | null
          id?: string
          invitee_user_id?: string
          inviter_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_invitee_user_id_fkey"
            columns: ["invitee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_invitee_user_id_fkey"
            columns: ["invitee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chat_invites: {
        Row: {
          chat_id: string
          chat_name: string | null
          created_at: string
          id: string
          invitee_user_id: string
          inviter_user_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          chat_id: string
          chat_name?: string | null
          created_at?: string
          id?: string
          invitee_user_id: string
          inviter_user_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          chat_id?: string
          chat_name?: string | null
          created_at?: string
          id?: string
          invitee_user_id?: string
          inviter_user_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_invites_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chat_invites_invitee_user_id_fkey"
            columns: ["invitee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chat_invites_invitee_user_id_fkey"
            columns: ["invitee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chat_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chat_invites_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_requests: {
        Row: {
          chat_id: string
          created_at: string | null
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string | null
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string | null
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      hazard_identifications: {
        Row: {
          ai_response: Json | null
          created_at: string
          hazard_type: string | null
          id: string
          image_url: string
          immediate_action: string | null
          ingested: boolean | null
          is_hazard: boolean | null
          object_identified: string | null
          pet_id: string | null
          toxicity_level: string | null
          user_id: string
        }
        Insert: {
          ai_response?: Json | null
          created_at?: string
          hazard_type?: string | null
          id?: string
          image_url: string
          immediate_action?: string | null
          ingested?: boolean | null
          is_hazard?: boolean | null
          object_identified?: string | null
          pet_id?: string | null
          toxicity_level?: string | null
          user_id: string
        }
        Update: {
          ai_response?: Json | null
          created_at?: string
          hazard_type?: string | null
          id?: string
          image_url?: string
          immediate_action?: string | null
          ingested?: boolean | null
          is_hazard?: boolean | null
          object_identified?: string | null
          pet_id?: string | null
          toxicity_level?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hazard_identifications_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hazard_identifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hazard_identifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      human_verification_attempts: {
        Row: {
          challenge_payload: Json
          challenge_token: string
          completed_at: string | null
          created_at: string
          evidence_path: string | null
          id: string
          result_payload: Json | null
          score: number | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_payload?: Json
          challenge_token: string
          completed_at?: string | null
          created_at?: string
          evidence_path?: string | null
          id?: string
          result_payload?: Json | null
          score?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_payload?: Json
          challenge_token?: string
          completed_at?: string | null
          created_at?: string
          evidence_path?: string | null
          id?: string
          result_payload?: Json | null
          score?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      identity_card_verifications: {
        Row: {
          card_brand: string | null
          card_fingerprint: string | null
          card_last4: string | null
          card_verification_status: string
          card_verified: boolean
          card_verified_at: string | null
          created_at: string
          stripe_customer_id: string | null
          stripe_setup_intent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_fingerprint?: string | null
          card_last4?: string | null
          card_verification_status?: string
          card_verified?: boolean
          card_verified_at?: string | null
          created_at?: string
          stripe_customer_id?: string | null
          stripe_setup_intent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_fingerprint?: string | null
          card_last4?: string | null
          card_verification_status?: string
          card_verified?: boolean
          card_verified_at?: string | null
          created_at?: string
          stripe_customer_id?: string | null
          stripe_setup_intent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      identity_verification_cleanup_queue: {
        Row: {
          created_at: string | null
          delete_after: string
          id: string
          object_path: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delete_after: string
          id?: string
          object_path: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          delete_after?: string
          id?: string
          object_path?: string
          user_id?: string
        }
        Relationships: []
      }
      link_preview_cache: {
        Row: {
          fetched_at: string
          payload: Json
          url: string
          url_hash: string
        }
        Insert: {
          fetched_at?: string
          payload: Json
          url: string
          url_hash: string
        }
        Update: {
          fetched_at?: string
          payload?: Json
          url?: string
          url_hash?: string
        }
        Relationships: []
      }
      link_preview_rate_limits: {
        Row: {
          bucket_start: string
          created_at: string
          key_type: string
          key_value: string
          request_count: number
        }
        Insert: {
          bucket_start: string
          created_at?: string
          key_type: string
          key_value: string
          request_count?: number
        }
        Update: {
          bucket_start?: string
          created_at?: string
          key_type?: string
          key_value?: string
          request_count?: number
        }
        Relationships: []
      }
      location_reviews: {
        Row: {
          created_at: string | null
          id: string
          location: unknown
          location_name: string
          location_type: string | null
          pet_friendly_score: number | null
          rating: number | null
          review: string | null
          reviewer_id: string
          safety_score: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          location?: unknown
          location_name: string
          location_type?: string | null
          pet_friendly_score?: number | null
          rating?: number | null
          review?: string | null
          reviewer_id: string
          safety_score?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          location?: unknown
          location_name?: string
          location_type?: string | null
          pet_friendly_score?: number | null
          rating?: number | null
          review?: string | null
          reviewer_id?: string
          safety_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_pet_alerts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          latitude: number
          longitude: number
          owner_id: string
          pet_id: string | null
          photo_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          latitude: number
          longitude: number
          owner_id: string
          pet_id?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          latitude?: number
          longitude?: number
          owner_id?: string
          pet_id?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_pet_alerts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_pet_alerts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_pet_alerts_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      map_alert_notification_queue: {
        Row: {
          alert_id: string
          attempts: number
          created_at: string
          last_error: string | null
          processed_at: string | null
          run_at: string
        }
        Insert: {
          alert_id: string
          attempts?: number
          created_at?: string
          last_error?: string | null
          processed_at?: string | null
          run_at: string
        }
        Update: {
          alert_id?: string
          attempts?: number
          created_at?: string
          last_error?: string | null
          processed_at?: string | null
          run_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_alert_notification_queue_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: true
            referencedRelation: "map_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      map_alerts: {
        Row: {
          address: string | null
          alert_type: string
          created_at: string | null
          creator_id: string
          description: string | null
          duration_hours: number | null
          expires_at: string | null
          id: string
          incident_admin_area: string | null
          incident_city: string | null
          incident_country_code: string | null
          incident_country_name: string | null
          incident_district: string | null
          incident_location_confidence: string | null
          incident_location_source: string | null
          is_active: boolean | null
          is_sensitive: boolean
          latitude: number
          location_district: string | null
          location_geog: unknown
          location_street: string | null
          longitude: number
          media_urls: string[] | null
          photo_url: string | null
          post_on_social: boolean
          posted_to_threads: boolean
          range_km: number | null
          range_meters: number | null
          report_count: number | null
          social_post_id: string | null
          social_status: string | null
          social_url: string | null
          support_count: number | null
          thread_id: string | null
          title: string | null
        }
        Insert: {
          address?: string | null
          alert_type: string
          created_at?: string | null
          creator_id: string
          description?: string | null
          duration_hours?: number | null
          expires_at?: string | null
          id?: string
          incident_admin_area?: string | null
          incident_city?: string | null
          incident_country_code?: string | null
          incident_country_name?: string | null
          incident_district?: string | null
          incident_location_confidence?: string | null
          incident_location_source?: string | null
          is_active?: boolean | null
          is_sensitive?: boolean
          latitude: number
          location_district?: string | null
          location_geog?: unknown
          location_street?: string | null
          longitude: number
          media_urls?: string[] | null
          photo_url?: string | null
          post_on_social?: boolean
          posted_to_threads?: boolean
          range_km?: number | null
          range_meters?: number | null
          report_count?: number | null
          social_post_id?: string | null
          social_status?: string | null
          social_url?: string | null
          support_count?: number | null
          thread_id?: string | null
          title?: string | null
        }
        Update: {
          address?: string | null
          alert_type?: string
          created_at?: string | null
          creator_id?: string
          description?: string | null
          duration_hours?: number | null
          expires_at?: string | null
          id?: string
          incident_admin_area?: string | null
          incident_city?: string | null
          incident_country_code?: string | null
          incident_country_name?: string | null
          incident_district?: string | null
          incident_location_confidence?: string | null
          incident_location_source?: string | null
          is_active?: boolean | null
          is_sensitive?: boolean
          latitude?: number
          location_district?: string | null
          location_geog?: unknown
          location_street?: string | null
          longitude?: number
          media_urls?: string[] | null
          photo_url?: string | null
          post_on_social?: boolean
          posted_to_threads?: boolean
          range_km?: number | null
          range_meters?: number | null
          report_count?: number | null
          social_post_id?: string | null
          social_status?: string | null
          social_url?: string | null
          support_count?: number | null
          thread_id?: string | null
          title?: string | null
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
          {
            foreignKeyName: "map_alerts_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      map_checkins: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_public: boolean | null
          location: unknown
          location_name: string | null
          location_type: string | null
          notes: string | null
          pet_ids: string[] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          location: unknown
          location_name?: string | null
          location_type?: string | null
          notes?: string | null
          pet_ids?: string[] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          location?: unknown
          location_name?: string | null
          location_type?: string | null
          notes?: string | null
          pet_ids?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_bookings: {
        Row: {
          amount: number
          client_id: string
          created_at: string | null
          dispute_flag: boolean | null
          dispute_reason: string | null
          escrow_release_date: string | null
          escrow_status: string | null
          id: string
          location_name: string | null
          paid_at: string | null
          platform_fee: number
          provider_fee: number | null
          quote_amount: number | null
          requester_fee: number | null
          service_end_date: string
          service_start_date: string
          sitter_id: string
          sitter_payout: number
          status: string | null
          stripe_charge_id: string | null
          stripe_payment_intent_id: string
          stripe_transfer_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string | null
          dispute_flag?: boolean | null
          dispute_reason?: string | null
          escrow_release_date?: string | null
          escrow_status?: string | null
          id?: string
          location_name?: string | null
          paid_at?: string | null
          platform_fee: number
          provider_fee?: number | null
          quote_amount?: number | null
          requester_fee?: number | null
          service_end_date: string
          service_start_date: string
          sitter_id: string
          sitter_payout: number
          status?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id: string
          stripe_transfer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string | null
          dispute_flag?: boolean | null
          dispute_reason?: string | null
          escrow_release_date?: string | null
          escrow_status?: string | null
          id?: string
          location_name?: string | null
          paid_at?: string | null
          platform_fee?: number
          provider_fee?: number | null
          quote_amount?: number | null
          requester_fee?: number | null
          service_end_date?: string
          service_start_date?: string
          sitter_id?: string
          sitter_payout?: number
          status?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string
          stripe_transfer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_sitter_id_fkey"
            columns: ["sitter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_bookings_sitter_id_fkey"
            columns: ["sitter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      match_preferences: {
        Row: {
          age_max: number | null
          age_min: number | null
          distance_km: number | null
          id: string
          looking_for: string[] | null
          requires_car: boolean | null
          requires_verification: boolean | null
          species_preference: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          distance_km?: number | null
          id?: string
          looking_for?: string[] | null
          requires_car?: boolean | null
          requires_verification?: boolean | null
          species_preference?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          distance_km?: number | null
          id?: string
          looking_for?: string[] | null
          requires_car?: boolean | null
          requires_verification?: boolean | null
          species_preference?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          chat_id: string | null
          id: string
          is_active: boolean | null
          last_interaction_at: string | null
          matched_at: string | null
          user1_id: string
          user2_id: string
        }
        Insert: {
          chat_id?: string | null
          id?: string
          is_active?: boolean | null
          last_interaction_at?: string | null
          matched_at?: string | null
          user1_id: string
          user2_id: string
        }
        Update: {
          chat_id?: string | null
          id?: string
          is_active?: boolean | null
          last_interaction_at?: string | null
          matched_at?: string | null
          user1_id?: string
          user2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          bucket: string
          content_id: string | null
          content_type: string | null
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          object_path: string
          owner_id: string
        }
        Insert: {
          bucket: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          object_path: string
          owner_id: string
        }
        Update: {
          bucket?: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          object_path?: string
          owner_id?: string
        }
        Relationships: []
      }
      message_reads: {
        Row: {
          chat_id: string | null
          id: string
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          id?: string
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string | null
          id?: string
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          content: string | null
          created_at: string | null
          id: string
          is_deleted: boolean | null
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          sender_id: string | null
          updated_at: string | null
        }
        Insert: {
          chat_id: string
          content?: string | null
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          sender_id?: string | null
          updated_at?: string | null
        }
        Update: {
          chat_id?: string
          content?: string | null
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          sender_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      native_social_post_pins: {
        Row: {
          pinned_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          pinned_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          pinned_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "native_social_post_pins_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_social_post_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_social_post_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      native_social_post_saves: {
        Row: {
          created_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "native_social_post_saves_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_social_post_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_social_post_saves_user_id_fkey"
            columns: ["user_id"]
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
      notification_aggregation_windows: {
        Row: {
          actor_ids: string[]
          actor_names: string[]
          category: string
          count: number
          created_at: string
          digest_closes_at: string | null
          href: string
          id: string
          kind: string
          last_emit_at: string | null
          last_emitted_count: number
          owner_user_id: string
          subject_id: string
          subject_type: string
          window_closes_at: string
        }
        Insert: {
          actor_ids?: string[]
          actor_names?: string[]
          category: string
          count?: number
          created_at?: string
          digest_closes_at?: string | null
          href?: string
          id?: string
          kind: string
          last_emit_at?: string | null
          last_emitted_count?: number
          owner_user_id: string
          subject_id: string
          subject_type: string
          window_closes_at: string
        }
        Update: {
          actor_ids?: string[]
          actor_names?: string[]
          category?: string
          count?: number
          created_at?: string
          digest_closes_at?: string | null
          href?: string
          id?: string
          kind?: string
          last_emit_at?: string | null
          last_emitted_count?: number
          owner_user_id?: string
          subject_id?: string
          subject_type?: string
          window_closes_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_aggregation_windows_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_aggregation_windows_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          alert_id: string | null
          created_at: string
          failure_count: number
          id: string
          metadata: Json | null
          notification_type: string
          recipients_count: number
          success_count: number
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          failure_count?: number
          id?: string
          metadata?: Json | null
          notification_type: string
          recipients_count?: number
          success_count?: number
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          failure_count?: number
          id?: string
          metadata?: Json | null
          notification_type?: string
          recipients_count?: number
          success_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "lost_pet_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_nudge_log: {
        Row: {
          kind: string
          sent_at: string
          user_id: string
        }
        Insert: {
          kind: string
          sent_at?: string
          user_id: string
        }
        Update: {
          kind?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_nudge_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_nudge_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          ai_vet_responses: boolean | null
          chats: boolean
          email: boolean
          email_enabled: boolean | null
          id: string
          map: boolean
          map_alerts: boolean | null
          marketing: boolean | null
          new_matches: boolean | null
          new_messages: boolean | null
          notice_board: boolean | null
          pause_all: boolean
          pets: boolean
          push_enabled: boolean | null
          push_news: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          social: boolean
          updated_at: string | null
          user_id: string
          vet: boolean
        }
        Insert: {
          ai_vet_responses?: boolean | null
          chats?: boolean
          email?: boolean
          email_enabled?: boolean | null
          id?: string
          map?: boolean
          map_alerts?: boolean | null
          marketing?: boolean | null
          new_matches?: boolean | null
          new_messages?: boolean | null
          notice_board?: boolean | null
          pause_all?: boolean
          pets?: boolean
          push_enabled?: boolean | null
          push_news?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          social?: boolean
          updated_at?: string | null
          user_id: string
          vet?: boolean
        }
        Update: {
          ai_vet_responses?: boolean | null
          chats?: boolean
          email?: boolean
          email_enabled?: boolean | null
          id?: string
          map?: boolean
          map_alerts?: boolean | null
          marketing?: boolean | null
          new_matches?: boolean | null
          new_messages?: boolean | null
          notice_board?: boolean | null
          pause_all?: boolean
          pets?: boolean
          push_enabled?: boolean | null
          push_news?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          social?: boolean
          updated_at?: string | null
          user_id?: string
          vet?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          href: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json
          read: boolean
          sent_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          href?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json
          read?: boolean
          sent_at?: string | null
          title?: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          href?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json
          read?: boolean
          sent_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          payment_method: string | null
          provider_payment_id: string | null
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          payment_method?: string | null
          provider_payment_id?: string | null
          status: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          payment_method?: string | null
          provider_payment_id?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_care_profiles: {
        Row: {
          agreement_accepted: boolean
          agreement_accepted_at: string | null
          agreement_version: string | null
          area_lat: number | null
          area_lng: number | null
          area_name: string | null
          completed: boolean
          created_at: string
          currency: string | null
          days: string[]
          dog_sizes: string[]
          emergency_readiness: boolean | null
          id: string
          listed: boolean
          location_styles: string[]
          min_notice_unit: string | null
          min_notice_value: number | null
          other_time_from: string | null
          other_time_to: string | null
          pet_types: string[]
          pet_types_other: string | null
          proof_metadata: Json
          rates: string[]
          rating_avg: number
          review_count: number
          service_rank_weight: number
          services_offered: string[]
          services_other: string | null
          skills: string[]
          specify_area: boolean
          starting_price: number | null
          story: string | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_onboarding_completed_at: string | null
          stripe_onboarding_started_at: string | null
          stripe_payout_status: string | null
          stripe_payouts_enabled: boolean
          stripe_requirements_currently_due: Json
          stripe_requirements_state: Json | null
          time_blocks: string[]
          updated_at: string
          user_id: string
          vet_license_found: boolean | null
          view_count: number
        }
        Insert: {
          agreement_accepted?: boolean
          agreement_accepted_at?: string | null
          agreement_version?: string | null
          area_lat?: number | null
          area_lng?: number | null
          area_name?: string | null
          completed?: boolean
          created_at?: string
          currency?: string | null
          days?: string[]
          dog_sizes?: string[]
          emergency_readiness?: boolean | null
          id?: string
          listed?: boolean
          location_styles?: string[]
          min_notice_unit?: string | null
          min_notice_value?: number | null
          other_time_from?: string | null
          other_time_to?: string | null
          pet_types?: string[]
          pet_types_other?: string | null
          proof_metadata?: Json
          rates?: string[]
          rating_avg?: number
          review_count?: number
          service_rank_weight?: number
          services_offered?: string[]
          services_other?: string | null
          skills?: string[]
          specify_area?: boolean
          starting_price?: number | null
          story?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_onboarding_completed_at?: string | null
          stripe_onboarding_started_at?: string | null
          stripe_payout_status?: string | null
          stripe_payouts_enabled?: boolean
          stripe_requirements_currently_due?: Json
          stripe_requirements_state?: Json | null
          time_blocks?: string[]
          updated_at?: string
          user_id: string
          vet_license_found?: boolean | null
          view_count?: number
        }
        Update: {
          agreement_accepted?: boolean
          agreement_accepted_at?: string | null
          agreement_version?: string | null
          area_lat?: number | null
          area_lng?: number | null
          area_name?: string | null
          completed?: boolean
          created_at?: string
          currency?: string | null
          days?: string[]
          dog_sizes?: string[]
          emergency_readiness?: boolean | null
          id?: string
          listed?: boolean
          location_styles?: string[]
          min_notice_unit?: string | null
          min_notice_value?: number | null
          other_time_from?: string | null
          other_time_to?: string | null
          pet_types?: string[]
          pet_types_other?: string | null
          proof_metadata?: Json
          rates?: string[]
          rating_avg?: number
          review_count?: number
          service_rank_weight?: number
          services_offered?: string[]
          services_other?: string | null
          skills?: string[]
          specify_area?: boolean
          starting_price?: number | null
          story?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_onboarding_completed_at?: string | null
          stripe_onboarding_started_at?: string | null
          stripe_payout_status?: string | null
          stripe_payouts_enabled?: boolean
          stripe_requirements_currently_due?: Json
          stripe_requirements_state?: Json | null
          time_blocks?: string[]
          updated_at?: string
          user_id?: string
          vet_license_found?: boolean | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_care_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_care_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          bio: string | null
          breed: string | null
          clinic_name: string | null
          created_at: string | null
          dob: string | null
          gender: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          medications: Json | null
          microchip_id: string | null
          name: string
          neutered_spayed: boolean | null
          next_vaccination_reminder: string | null
          owner_id: string
          phone_no: string | null
          photo_url: string | null
          preferred_vet: string | null
          routine: string | null
          set_reminder: Json | null
          species: string
          temperament: string[] | null
          updated_at: string | null
          vaccination_dates: string[] | null
          vaccinations: Json | null
          vet_contact: string | null
          vet_visit_records: Json
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          bio?: string | null
          breed?: string | null
          clinic_name?: string | null
          created_at?: string | null
          dob?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          medications?: Json | null
          microchip_id?: string | null
          name: string
          neutered_spayed?: boolean | null
          next_vaccination_reminder?: string | null
          owner_id: string
          phone_no?: string | null
          photo_url?: string | null
          preferred_vet?: string | null
          routine?: string | null
          set_reminder?: Json | null
          species: string
          temperament?: string[] | null
          updated_at?: string | null
          vaccination_dates?: string[] | null
          vaccinations?: Json | null
          vet_contact?: string | null
          vet_visit_records?: Json
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          bio?: string | null
          breed?: string | null
          clinic_name?: string | null
          created_at?: string | null
          dob?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          medications?: Json | null
          microchip_id?: string | null
          name?: string
          neutered_spayed?: boolean | null
          next_vaccination_reminder?: string | null
          owner_id?: string
          phone_no?: string | null
          photo_url?: string | null
          preferred_vet?: string | null
          routine?: string | null
          set_reminder?: Json | null
          species?: string
          temperament?: string[] | null
          updated_at?: string | null
          vaccination_dates?: string[] | null
          vaccinations?: Json | null
          vet_contact?: string | null
          vet_visit_records?: Json
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
      phone_otp_attempts: {
        Row: {
          attempt_type: string
          created_at: string
          device_id: string | null
          error_message: string | null
          id: number
          ip_address: string
          phone_hash: string
          reason: string | null
          request_count_today: number
          seconds_since_last_request: number
          session_id: string | null
          status: string
          suspicious_flags: string[]
          user_id: string | null
          verify_count_today: number
        }
        Insert: {
          attempt_type: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: number
          ip_address: string
          phone_hash: string
          reason?: string | null
          request_count_today?: number
          seconds_since_last_request?: number
          session_id?: string | null
          status: string
          suspicious_flags?: string[]
          user_id?: string | null
          verify_count_today?: number
        }
        Update: {
          attempt_type?: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: number
          ip_address?: string
          phone_hash?: string
          reason?: string | null
          request_count_today?: number
          seconds_since_last_request?: number
          session_id?: string | null
          status?: string
          suspicious_flags?: string[]
          user_id?: string | null
          verify_count_today?: number
        }
        Relationships: []
      }
      phone_otp_challenges: {
        Row: {
          created_at: string
          device_id: string | null
          error_reason: string | null
          expires_at: string
          id: string
          otp_type: string
          phone_e164: string
          phone_hash: string
          provider: string
          provider_ref: string | null
          sent_at: string
          session_id: string | null
          status: string
          updated_at: string
          user_id: string | null
          verified_at: string | null
          verify_attempt_count: number
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          error_reason?: string | null
          expires_at?: string
          id?: string
          otp_type: string
          phone_e164: string
          phone_hash: string
          provider?: string
          provider_ref?: string | null
          sent_at?: string
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
          verify_attempt_count?: number
        }
        Update: {
          created_at?: string
          device_id?: string | null
          error_reason?: string | null
          expires_at?: string
          id?: string
          otp_type?: string
          phone_e164?: string
          phone_hash?: string
          provider?: string
          provider_ref?: string | null
          sent_at?: string
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
          verify_attempt_count?: number
        }
        Relationships: []
      }
      pins: {
        Row: {
          address: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_invisible: boolean
          is_public: boolean
          lat: number | null
          lng: number | null
          thread_id: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_invisible?: boolean
          is_public?: boolean
          lat?: number | null
          lng?: number | null
          thread_id?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_invisible?: boolean
          is_public?: boolean
          lat?: number | null
          lng?: number | null
          thread_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      plan_metadata: {
        Row: {
          billing_cycle: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          plan_key: string
          plan_name: string
          priority: number
          stripe_lookup_key: string
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          plan_key: string
          plan_name: string
          priority?: number
          stripe_lookup_key: string
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          plan_key?: string
          plan_name?: string
          priority?: number
          stripe_lookup_key?: string
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      poi_locations: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          is_active: boolean
          last_harvested_at: string | null
          latitude: number
          longitude: number
          name: string
          opening_hours: string | null
          osm_id: string
          phone: string | null
          poi_type: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          last_harvested_at?: string | null
          latitude: number
          longitude: number
          name: string
          opening_hours?: string | null
          osm_id: string
          phone?: string | null
          poi_type: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          last_harvested_at?: string | null
          latitude?: number
          longitude?: number
          name?: string
          opening_hours?: string | null
          osm_id?: string
          phone?: string | null
          poi_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      post_mentions: {
        Row: {
          created_at: string
          end_idx: number
          mentioned_user_id: string
          post_id: string
          social_id_at_time: string
          start_idx: number
        }
        Insert: {
          created_at?: string
          end_idx: number
          mentioned_user_id: string
          post_id: string
          social_id_at_time: string
          start_idx: number
        }
        Update: {
          created_at?: string
          end_idx?: number
          mentioned_user_id?: string
          post_id?: string
          social_id_at_time?: string
          start_idx?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      presignup_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          signal_key: string
          signup_proof: string | null
          signup_proof_expires_at: string | null
          signup_proof_issued_at: string | null
          signup_proof_used_at: string | null
          token: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          signal_key?: string
          signup_proof?: string | null
          signup_proof_expires_at?: string | null
          signup_proof_issued_at?: string | null
          signup_proof_used_at?: string | null
          token: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          signal_key?: string
          signup_proof?: string | null
          signup_proof_expires_at?: string | null
          signup_proof_issued_at?: string | null
          signup_proof_used_at?: string | null
          token?: string
          verified?: boolean
        }
        Relationships: []
      }
      presignup_verify_signals: {
        Row: {
          signal_key: string
          verified_at: string
        }
        Insert: {
          signal_key: string
          verified_at?: string
        }
        Update: {
          signal_key?: string
          verified_at?: string
        }
        Relationships: []
      }
      professional_credentials: {
        Row: {
          country_region: string
          created_at: string
          credential_type: string
          document_storage_path: string | null
          expiry_date: string | null
          id: string
          issuing_body: string | null
          last_checked_at: string | null
          legal_name: string
          license_number_hmac: string | null
          license_number_masked: string | null
          matched_at: string | null
          provider_profile_id: string | null
          public_label: string
          status: Database["public"]["Enums"]["professional_credential_status"]
          updated_at: string
          user_id: string
          verification_method: Database["public"]["Enums"]["credential_verification_method"]
        }
        Insert: {
          country_region: string
          created_at?: string
          credential_type: string
          document_storage_path?: string | null
          expiry_date?: string | null
          id?: string
          issuing_body?: string | null
          last_checked_at?: string | null
          legal_name: string
          license_number_hmac?: string | null
          license_number_masked?: string | null
          matched_at?: string | null
          provider_profile_id?: string | null
          public_label?: string
          status?: Database["public"]["Enums"]["professional_credential_status"]
          updated_at?: string
          user_id: string
          verification_method?: Database["public"]["Enums"]["credential_verification_method"]
        }
        Update: {
          country_region?: string
          created_at?: string
          credential_type?: string
          document_storage_path?: string | null
          expiry_date?: string | null
          id?: string
          issuing_body?: string | null
          last_checked_at?: string | null
          legal_name?: string
          license_number_hmac?: string | null
          license_number_masked?: string | null
          matched_at?: string | null
          provider_profile_id?: string | null
          public_label?: string
          status?: Database["public"]["Enums"]["professional_credential_status"]
          updated_at?: string
          user_id?: string
          verification_method?: Database["public"]["Enums"]["credential_verification_method"]
        }
        Relationships: [
          {
            foreignKeyName: "professional_credentials_provider_profile_id_fkey"
            columns: ["provider_profile_id"]
            isOneToOne: false
            referencedRelation: "pet_care_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status_enum"]
          affiliation: string | null
          availability_status: string[] | null
          avatar_url: string | null
          bio: string | null
          brevo_sync_reason: string | null
          brevo_sync_required: boolean
          card_brand: string | null
          card_last4: string | null
          card_verification_status: string
          card_verified: boolean
          card_verified_at: string | null
          care_circle: string[] | null
          created_at: string | null
          degree: string | null
          display_name: string | null
          dob: string | null
          effective_tier: Database["public"]["Enums"]["tier_enum"] | null
          email: string | null
          email_verified: boolean
          email_verify_token: string | null
          email_verify_token_expires_at: string | null
          emergency_mode: boolean | null
          experience_years: number | null
          family_slots: number | null
          fcm_token: string | null
          full_name: string | null
          gender_genre: string | null
          has_car: boolean | null
          height: number | null
          hide_from_map: boolean | null
          human_verification_status: string
          human_verified_at: string | null
          id: string
          is_admin: boolean | null
          is_verified: boolean | null
          languages: string[] | null
          last_active_at: string | null
          last_active_synced_at: string | null
          last_lat: number | null
          last_lng: number | null
          last_login: string | null
          last_payment_date: string | null
          latitude: number | null
          legal_name: string | null
          location: unknown
          location_country: string | null
          location_district: string | null
          location_geog: unknown
          location_name: string | null
          location_pinned_until: string | null
          location_retention_until: string | null
          longitude: number | null
          major: string | null
          map_visible: boolean
          marketing_consent: boolean
          marketing_consent_at: string | null
          marketing_doi_confirmed: boolean
          marketing_doi_confirmed_at: string | null
          marketing_doi_token: string | null
          marketing_doi_token_expires_at: string | null
          marketing_opt_in_checked: boolean
          marketing_opt_in_checked_at: string | null
          marketing_subscribed: boolean
          marketing_unsubscribed_at: string | null
          media_credits: number | null
          mesh_alert_count: number | null
          non_social: boolean | null
          occupation: string | null
          onboarding_completed: boolean | null
          orientation: string | null
          owns_pets: boolean | null
          payment_method: string | null
          pet_experience: string[] | null
          phone: string | null
          phone_verification_status: Database["public"]["Enums"]["verification_status_enum"]
          phone_verified_at: string | null
          photos: Json
          posted_to_threads: boolean
          prefs: Json
          profile_editorial_v1: boolean
          profile_photos_migrated_seen_at: string | null
          relationship_status: string | null
          restriction_expires_at: string | null
          role: string | null
          school: string | null
          share_perks_cancel_at_period_end: boolean
          share_perks_cancel_reason: string | null
          share_perks_cancel_reason_other: string | null
          share_perks_cancel_requested_at: string | null
          share_perks_subscription_current_period_end: string | null
          share_perks_subscription_id: string | null
          share_perks_subscription_status: string | null
          show_academic: boolean | null
          show_affiliation: boolean | null
          show_age: boolean | null
          show_bio: boolean | null
          show_gender: boolean | null
          show_height: boolean | null
          show_occupation: boolean | null
          show_orientation: boolean | null
          show_relationship_status: boolean | null
          show_weight: boolean | null
          social_album: string[] | null
          social_availability: boolean | null
          social_id: string
          stars_count: number | null
          stripe_customer_id: string | null
          stripe_setup_intent_id: string | null
          stripe_subscription_id: string | null
          subscription_cancel_at_period_end: boolean
          subscription_cancel_reason: string | null
          subscription_cancel_reason_other: string | null
          subscription_cancel_requested_at: string | null
          subscription_current_period_end: string | null
          subscription_current_period_start: string | null
          subscription_cycle_anchor_day: number | null
          subscription_start: string | null
          subscription_status: string | null
          suspension_expires_at: string | null
          tier: string | null
          top_profile_boost_until: string | null
          updated_at: string | null
          user_id: string | null
          user_role: string | null
          verification_comment: string | null
          verification_document_url: string | null
          verification_rejection_code: string | null
          verification_status:
            | Database["public"]["Enums"]["verification_status_enum"]
            | null
          verified: boolean | null
          vouch_score: number | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status_enum"]
          affiliation?: string | null
          availability_status?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          brevo_sync_reason?: string | null
          brevo_sync_required?: boolean
          card_brand?: string | null
          card_last4?: string | null
          card_verification_status?: string
          card_verified?: boolean
          card_verified_at?: string | null
          care_circle?: string[] | null
          created_at?: string | null
          degree?: string | null
          display_name?: string | null
          dob?: string | null
          effective_tier?: Database["public"]["Enums"]["tier_enum"] | null
          email?: string | null
          email_verified?: boolean
          email_verify_token?: string | null
          email_verify_token_expires_at?: string | null
          emergency_mode?: boolean | null
          experience_years?: number | null
          family_slots?: number | null
          fcm_token?: string | null
          full_name?: string | null
          gender_genre?: string | null
          has_car?: boolean | null
          height?: number | null
          hide_from_map?: boolean | null
          human_verification_status?: string
          human_verified_at?: string | null
          id?: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          languages?: string[] | null
          last_active_at?: string | null
          last_active_synced_at?: string | null
          last_lat?: number | null
          last_lng?: number | null
          last_login?: string | null
          last_payment_date?: string | null
          latitude?: number | null
          legal_name?: string | null
          location?: unknown
          location_country?: string | null
          location_district?: string | null
          location_geog?: unknown
          location_name?: string | null
          location_pinned_until?: string | null
          location_retention_until?: string | null
          longitude?: number | null
          major?: string | null
          map_visible?: boolean
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          marketing_doi_confirmed?: boolean
          marketing_doi_confirmed_at?: string | null
          marketing_doi_token?: string | null
          marketing_doi_token_expires_at?: string | null
          marketing_opt_in_checked?: boolean
          marketing_opt_in_checked_at?: string | null
          marketing_subscribed?: boolean
          marketing_unsubscribed_at?: string | null
          media_credits?: number | null
          mesh_alert_count?: number | null
          non_social?: boolean | null
          occupation?: string | null
          onboarding_completed?: boolean | null
          orientation?: string | null
          owns_pets?: boolean | null
          payment_method?: string | null
          pet_experience?: string[] | null
          phone?: string | null
          phone_verification_status?: Database["public"]["Enums"]["verification_status_enum"]
          phone_verified_at?: string | null
          photos?: Json
          posted_to_threads?: boolean
          prefs?: Json
          profile_editorial_v1?: boolean
          profile_photos_migrated_seen_at?: string | null
          relationship_status?: string | null
          restriction_expires_at?: string | null
          role?: string | null
          school?: string | null
          share_perks_cancel_at_period_end?: boolean
          share_perks_cancel_reason?: string | null
          share_perks_cancel_reason_other?: string | null
          share_perks_cancel_requested_at?: string | null
          share_perks_subscription_current_period_end?: string | null
          share_perks_subscription_id?: string | null
          share_perks_subscription_status?: string | null
          show_academic?: boolean | null
          show_affiliation?: boolean | null
          show_age?: boolean | null
          show_bio?: boolean | null
          show_gender?: boolean | null
          show_height?: boolean | null
          show_occupation?: boolean | null
          show_orientation?: boolean | null
          show_relationship_status?: boolean | null
          show_weight?: boolean | null
          social_album?: string[] | null
          social_availability?: boolean | null
          social_id: string
          stars_count?: number | null
          stripe_customer_id?: string | null
          stripe_setup_intent_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_cancel_reason?: string | null
          subscription_cancel_reason_other?: string | null
          subscription_cancel_requested_at?: string | null
          subscription_current_period_end?: string | null
          subscription_current_period_start?: string | null
          subscription_cycle_anchor_day?: number | null
          subscription_start?: string | null
          subscription_status?: string | null
          suspension_expires_at?: string | null
          tier?: string | null
          top_profile_boost_until?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_role?: string | null
          verification_comment?: string | null
          verification_document_url?: string | null
          verification_rejection_code?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status_enum"]
            | null
          verified?: boolean | null
          vouch_score?: number | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status_enum"]
          affiliation?: string | null
          availability_status?: string[] | null
          avatar_url?: string | null
          bio?: string | null
          brevo_sync_reason?: string | null
          brevo_sync_required?: boolean
          card_brand?: string | null
          card_last4?: string | null
          card_verification_status?: string
          card_verified?: boolean
          card_verified_at?: string | null
          care_circle?: string[] | null
          created_at?: string | null
          degree?: string | null
          display_name?: string | null
          dob?: string | null
          effective_tier?: Database["public"]["Enums"]["tier_enum"] | null
          email?: string | null
          email_verified?: boolean
          email_verify_token?: string | null
          email_verify_token_expires_at?: string | null
          emergency_mode?: boolean | null
          experience_years?: number | null
          family_slots?: number | null
          fcm_token?: string | null
          full_name?: string | null
          gender_genre?: string | null
          has_car?: boolean | null
          height?: number | null
          hide_from_map?: boolean | null
          human_verification_status?: string
          human_verified_at?: string | null
          id?: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          languages?: string[] | null
          last_active_at?: string | null
          last_active_synced_at?: string | null
          last_lat?: number | null
          last_lng?: number | null
          last_login?: string | null
          last_payment_date?: string | null
          latitude?: number | null
          legal_name?: string | null
          location?: unknown
          location_country?: string | null
          location_district?: string | null
          location_geog?: unknown
          location_name?: string | null
          location_pinned_until?: string | null
          location_retention_until?: string | null
          longitude?: number | null
          major?: string | null
          map_visible?: boolean
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          marketing_doi_confirmed?: boolean
          marketing_doi_confirmed_at?: string | null
          marketing_doi_token?: string | null
          marketing_doi_token_expires_at?: string | null
          marketing_opt_in_checked?: boolean
          marketing_opt_in_checked_at?: string | null
          marketing_subscribed?: boolean
          marketing_unsubscribed_at?: string | null
          media_credits?: number | null
          mesh_alert_count?: number | null
          non_social?: boolean | null
          occupation?: string | null
          onboarding_completed?: boolean | null
          orientation?: string | null
          owns_pets?: boolean | null
          payment_method?: string | null
          pet_experience?: string[] | null
          phone?: string | null
          phone_verification_status?: Database["public"]["Enums"]["verification_status_enum"]
          phone_verified_at?: string | null
          photos?: Json
          posted_to_threads?: boolean
          prefs?: Json
          profile_editorial_v1?: boolean
          profile_photos_migrated_seen_at?: string | null
          relationship_status?: string | null
          restriction_expires_at?: string | null
          role?: string | null
          school?: string | null
          share_perks_cancel_at_period_end?: boolean
          share_perks_cancel_reason?: string | null
          share_perks_cancel_reason_other?: string | null
          share_perks_cancel_requested_at?: string | null
          share_perks_subscription_current_period_end?: string | null
          share_perks_subscription_id?: string | null
          share_perks_subscription_status?: string | null
          show_academic?: boolean | null
          show_affiliation?: boolean | null
          show_age?: boolean | null
          show_bio?: boolean | null
          show_gender?: boolean | null
          show_height?: boolean | null
          show_occupation?: boolean | null
          show_orientation?: boolean | null
          show_relationship_status?: boolean | null
          show_weight?: boolean | null
          social_album?: string[] | null
          social_availability?: boolean | null
          social_id?: string
          stars_count?: number | null
          stripe_customer_id?: string | null
          stripe_setup_intent_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_cancel_reason?: string | null
          subscription_cancel_reason_other?: string | null
          subscription_cancel_requested_at?: string | null
          subscription_current_period_end?: string | null
          subscription_current_period_start?: string | null
          subscription_cycle_anchor_day?: number | null
          subscription_start?: string | null
          subscription_status?: string | null
          suspension_expires_at?: string | null
          tier?: string | null
          top_profile_boost_until?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_role?: string | null
          verification_comment?: string | null
          verification_document_url?: string | null
          verification_rejection_code?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status_enum"]
            | null
          verified?: boolean | null
          vouch_score?: number | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          device_id: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          due_date: string
          id: string
          kind: string | null
          owner_id: string
          pet_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          kind?: string | null
          owner_id: string
          pet_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          kind?: string | null
          owner_id?: string
          pet_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_mentions: {
        Row: {
          created_at: string
          end_idx: number
          mentioned_user_id: string
          reply_id: string
          social_id_at_time: string
          start_idx: number
        }
        Insert: {
          created_at?: string
          end_idx: number
          mentioned_user_id: string
          reply_id: string
          social_id_at_time: string
          start_idx: number
        }
        Update: {
          created_at?: string
          end_idx?: number
          mentioned_user_id?: string
          reply_id?: string
          social_id_at_time?: string
          start_idx?: number
        }
        Relationships: [
          {
            foreignKeyName: "reply_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_mentions_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "thread_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      reporter_false_report_penalties: {
        Row: {
          created_at: string
          false_report_count: number
          last_penalized_at: string | null
          last_penalized_by: string | null
          metadata: Json
          reporter_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          false_report_count?: number
          last_penalized_at?: string | null
          last_penalized_by?: string | null
          metadata?: Json
          reporter_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          false_report_count?: number
          last_penalized_at?: string | null
          last_penalized_by?: string | null
          metadata?: Json
          reporter_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporter_false_report_penalties_last_penalized_by_fkey"
            columns: ["last_penalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporter_false_report_penalties_last_penalized_by_fkey"
            columns: ["last_penalized_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporter_false_report_penalties_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporter_false_report_penalties_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_rate_limits: {
        Row: {
          id: string
          scan_timestamp: string
          user_id: string
        }
        Insert: {
          id?: string
          scan_timestamp?: string
          user_id: string
        }
        Update: {
          id?: string
          scan_timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      service_analytics: {
        Row: {
          created_at: string
          event: string
          id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      service_bookmarks: {
        Row: {
          created_at: string
          id: string
          provider_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      service_care_events: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          media_urls: Json
          metadata: Json
          note: string | null
          service_chat_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          media_urls?: Json
          metadata?: Json
          note?: string | null
          service_chat_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          media_urls?: Json
          metadata?: Json
          note?: string | null
          service_chat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_care_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_care_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_care_events_service_chat_id_fkey"
            columns: ["service_chat_id"]
            isOneToOne: false
            referencedRelation: "service_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      service_chats: {
        Row: {
          booked_at: string | null
          booking_snapshot: Json | null
          booking_snapshot_pending: Json | null
          care_status: string | null
          chat_id: string
          checkin_photo_url: string | null
          checkin_submitted_at: string | null
          completed_at: string | null
          created_at: string | null
          disputed_at: string | null
          handoff_problem_reported_at: string | null
          id: string
          in_progress_at: string | null
          no_start_charge_applied_at: string | null
          payout_hold_until: string | null
          payout_release_attempted_at: string | null
          payout_release_lock_token: string | null
          payout_release_locked_at: string | null
          payout_release_requested_at: string | null
          payout_released_at: string | null
          pin_attempt_count: number
          pin_locked_until: string | null
          pin_shared_at: string | null
          pin_shared_by: string | null
          provider_id: string
          provider_mark_finished: boolean
          quote_card: Json | null
          quote_opened_at: string | null
          quote_sent_at: string | null
          refund_issued_at: string | null
          reminder_one_hour_sent_at: string | null
          reminder_tomorrow_sent_at: string | null
          request_card: Json | null
          request_opened_at: string | null
          request_sent_at: string | null
          requester_id: string
          requester_mark_finished: boolean
          requester_response_due_at: string | null
          start_pin_hash: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
        }
        Insert: {
          booked_at?: string | null
          booking_snapshot?: Json | null
          booking_snapshot_pending?: Json | null
          care_status?: string | null
          chat_id: string
          checkin_photo_url?: string | null
          checkin_submitted_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          disputed_at?: string | null
          handoff_problem_reported_at?: string | null
          id?: string
          in_progress_at?: string | null
          no_start_charge_applied_at?: string | null
          payout_hold_until?: string | null
          payout_release_attempted_at?: string | null
          payout_release_lock_token?: string | null
          payout_release_locked_at?: string | null
          payout_release_requested_at?: string | null
          payout_released_at?: string | null
          pin_attempt_count?: number
          pin_locked_until?: string | null
          pin_shared_at?: string | null
          pin_shared_by?: string | null
          provider_id: string
          provider_mark_finished?: boolean
          quote_card?: Json | null
          quote_opened_at?: string | null
          quote_sent_at?: string | null
          refund_issued_at?: string | null
          reminder_one_hour_sent_at?: string | null
          reminder_tomorrow_sent_at?: string | null
          request_card?: Json | null
          request_opened_at?: string | null
          request_sent_at?: string | null
          requester_id: string
          requester_mark_finished?: boolean
          requester_response_due_at?: string | null
          start_pin_hash?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          booked_at?: string | null
          booking_snapshot?: Json | null
          booking_snapshot_pending?: Json | null
          care_status?: string | null
          chat_id?: string
          checkin_photo_url?: string | null
          checkin_submitted_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          disputed_at?: string | null
          handoff_problem_reported_at?: string | null
          id?: string
          in_progress_at?: string | null
          no_start_charge_applied_at?: string | null
          payout_hold_until?: string | null
          payout_release_attempted_at?: string | null
          payout_release_lock_token?: string | null
          payout_release_locked_at?: string | null
          payout_release_requested_at?: string | null
          payout_released_at?: string | null
          pin_attempt_count?: number
          pin_locked_until?: string | null
          pin_shared_at?: string | null
          pin_shared_by?: string | null
          provider_id?: string
          provider_mark_finished?: boolean
          quote_card?: Json | null
          quote_opened_at?: string | null
          quote_sent_at?: string | null
          refund_issued_at?: string | null
          reminder_one_hour_sent_at?: string | null
          reminder_tomorrow_sent_at?: string | null
          request_card?: Json | null
          request_opened_at?: string | null
          request_sent_at?: string | null
          requester_id?: string
          requester_mark_finished?: boolean
          requester_response_due_at?: string | null
          start_pin_hash?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_chats_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_chats_pin_shared_by_fkey"
            columns: ["pin_shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_chats_pin_shared_by_fkey"
            columns: ["pin_shared_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      service_disputes: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string | null
          decision_action: string | null
          decision_actor_id: string | null
          decision_at: string | null
          decision_note: string | null
          decision_payload: Json
          decision_version: number
          description: string
          evidence_urls: string[]
          executed_at: string | null
          executed_by: string | null
          filed_by: string
          final_customer_refund_amount: number | null
          final_huddle_retained_amount: number | null
          final_provider_receives_amount: number | null
          id: string
          service_chat_id: string
          status: string
          stripe_action_status: string | null
          stripe_charge_id: string | null
          stripe_connected_account_id: string | null
          stripe_error_code: string | null
          stripe_error_message: string | null
          stripe_idempotency_key: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          stripe_transfer_id: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          category: string
          created_at?: string | null
          decision_action?: string | null
          decision_actor_id?: string | null
          decision_at?: string | null
          decision_note?: string | null
          decision_payload?: Json
          decision_version?: number
          description: string
          evidence_urls?: string[]
          executed_at?: string | null
          executed_by?: string | null
          filed_by: string
          final_customer_refund_amount?: number | null
          final_huddle_retained_amount?: number | null
          final_provider_receives_amount?: number | null
          id?: string
          service_chat_id: string
          status?: string
          stripe_action_status?: string | null
          stripe_charge_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_error_code?: string | null
          stripe_error_message?: string | null
          stripe_idempotency_key?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string | null
          decision_action?: string | null
          decision_actor_id?: string | null
          decision_at?: string | null
          decision_note?: string | null
          decision_payload?: Json
          decision_version?: number
          description?: string
          evidence_urls?: string[]
          executed_at?: string | null
          executed_by?: string | null
          filed_by?: string
          final_customer_refund_amount?: number | null
          final_huddle_retained_amount?: number | null
          final_provider_receives_amount?: number | null
          id?: string
          service_chat_id?: string
          status?: string
          stripe_action_status?: string | null
          stripe_charge_id?: string | null
          stripe_connected_account_id?: string | null
          stripe_error_code?: string | null
          stripe_error_message?: string | null
          stripe_idempotency_key?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_disputes_decision_actor_id_fkey"
            columns: ["decision_actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_disputes_decision_actor_id_fkey"
            columns: ["decision_actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_disputes_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_disputes_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_disputes_service_chat_id_fkey"
            columns: ["service_chat_id"]
            isOneToOne: false
            referencedRelation: "service_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reviews: {
        Row: {
          created_at: string | null
          eligible_for_provider_rating: boolean
          id: string
          media_urls: string[]
          provider_id: string
          rating: number
          review_text: string | null
          reviewee_id: string | null
          reviewer_id: string
          reviewer_role: string | null
          safety_incident_reported: boolean
          service_chat_id: string
          service_dispute_id: string | null
          tags: string[]
        }
        Insert: {
          created_at?: string | null
          eligible_for_provider_rating?: boolean
          id?: string
          media_urls?: string[]
          provider_id: string
          rating: number
          review_text?: string | null
          reviewee_id?: string | null
          reviewer_id: string
          reviewer_role?: string | null
          safety_incident_reported?: boolean
          service_chat_id: string
          service_dispute_id?: string | null
          tags?: string[]
        }
        Update: {
          created_at?: string | null
          eligible_for_provider_rating?: boolean
          id?: string
          media_urls?: string[]
          provider_id?: string
          rating?: number
          review_text?: string | null
          reviewee_id?: string | null
          reviewer_id?: string
          reviewer_role?: string | null
          safety_incident_reported?: boolean
          service_chat_id?: string
          service_dispute_id?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "service_reviews_service_chat_id_fkey"
            columns: ["service_chat_id"]
            isOneToOne: false
            referencedRelation: "service_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reviews_service_dispute_id_fkey"
            columns: ["service_dispute_id"]
            isOneToOne: false
            referencedRelation: "service_disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reviews_service_dispute_id_fkey"
            columns: ["service_dispute_id"]
            isOneToOne: false
            referencedRelation: "view_admin_service_disputes_queue"
            referencedColumns: ["dispute_id"]
          },
        ]
      }
      sitter_profiles: {
        Row: {
          availability: Json | null
          bio: string | null
          charges_enabled: boolean | null
          created_at: string | null
          hourly_rate: number | null
          id: string
          onboarding_complete: boolean | null
          payouts_enabled: boolean | null
          rating: number | null
          services: Json | null
          stripe_connect_account_id: string
          total_bookings: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          availability?: Json | null
          bio?: string | null
          charges_enabled?: boolean | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          onboarding_complete?: boolean | null
          payouts_enabled?: boolean | null
          rating?: number | null
          services?: Json | null
          stripe_connect_account_id: string
          total_bookings?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          availability?: Json | null
          bio?: string | null
          charges_enabled?: boolean | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          onboarding_complete?: boolean | null
          payouts_enabled?: boolean | null
          rating?: number | null
          services?: Json | null
          stripe_connect_account_id?: string
          total_bookings?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sitter_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sitter_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      social_feed_events: {
        Row: {
          author_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          session_id: string | null
          thread_id: string
          viewer_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          session_id?: string | null
          thread_id: string
          viewer_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          session_id?: string | null
          thread_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_feed_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_feed_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_feed_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_feed_events_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_feed_events_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      social_feed_scope_fallback_audit: {
        Row: {
          alert_context: Json
          fallback_count: number
          fallback_reason: string
          first_seen_at: string
          last_seen_at: string
          last_viewer_id: string | null
          thread_id: string
        }
        Insert: {
          alert_context?: Json
          fallback_count?: number
          fallback_reason: string
          first_seen_at?: string
          last_seen_at?: string
          last_viewer_id?: string | null
          thread_id: string
        }
        Update: {
          alert_context?: Json
          fallback_count?: number
          fallback_reason?: string
          first_seen_at?: string
          last_seen_at?: string
          last_viewer_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_feed_scope_fallback_audit_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      social_interactions: {
        Row: {
          created_at: string | null
          id: string
          interaction_type: string
          reason: string | null
          target_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          interaction_type: string
          reason?: string | null
          target_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          interaction_type?: string
          reason?: string | null
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_interactions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_interactions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      social_video_uploads: {
        Row: {
          attached_at: string | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          embed_url: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          finalized_at: string | null
          id: string
          playback_url: string | null
          preview_url: string | null
          provider: string
          provider_payload: Json
          provider_video_id: string
          status: string
          thread_id: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          upload_expires_at: string | null
          user_id: string
        }
        Insert: {
          attached_at?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          embed_url?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          finalized_at?: string | null
          id?: string
          playback_url?: string | null
          preview_url?: string | null
          provider?: string
          provider_payload?: Json
          provider_video_id: string
          status?: string
          thread_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          upload_expires_at?: string | null
          user_id: string
        }
        Update: {
          attached_at?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          embed_url?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          finalized_at?: string | null
          id?: string
          playback_url?: string | null
          preview_url?: string | null
          provider?: string
          provider_payload?: Json
          provider_video_id?: string
          status?: string
          thread_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          upload_expires_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_video_uploads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_video_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_video_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      storage_cleanup_queue: {
        Row: {
          attempts: number
          bucket: string
          created_at: string
          error_message: string | null
          id: string
          object_path: string
          processed_at: string | null
          reason: string
          requested_by: string | null
        }
        Insert: {
          attempts?: number
          bucket: string
          created_at?: string
          error_message?: string | null
          id?: string
          object_path: string
          processed_at?: string | null
          reason: string
          requested_by?: string | null
        }
        Update: {
          attempts?: number
          bucket?: string
          created_at?: string
          error_message?: string | null
          id?: string
          object_path?: string
          processed_at?: string | null
          reason?: string
          requested_by?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          cancelled_at: string | null
          created_at: string | null
          current_period_end: string
          current_period_start: string
          id: string
          payment_provider: string | null
          plan_type: string
          provider_subscription_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end: string
          current_period_start: string
          id?: string
          payment_provider?: string | null
          plan_type: string
          provider_subscription_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          payment_provider?: string | null
          plan_type?: string
          provider_subscription_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          category: string | null
          contact_method: string | null
          created_at: string | null
          email: string | null
          id: string
          message: string
          subject: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          contact_method?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          message: string
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          contact_method?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string
          subject?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string
          ticket_number: string
          user_id: string | null
          wants_reply: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
          subject: string
          ticket_number: string
          user_id?: string | null
          wants_reply?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string
          ticket_number?: string
          user_id?: string | null
          wants_reply?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_huddle_case_messages: {
        Row: {
          case_id: string
          case_type: string
          chat_id: string
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          message_body: string
          message_id: string
          notification_href: string | null
          notification_id: string | null
          recipient_role: string
          recipient_user_id: string
          sender_user_id: string
        }
        Insert: {
          case_id: string
          case_type: string
          chat_id: string
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          message_body: string
          message_id: string
          notification_href?: string | null
          notification_id?: string | null
          recipient_role: string
          recipient_user_id: string
          sender_user_id: string
        }
        Update: {
          case_id?: string
          case_type?: string
          chat_id?: string
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          message_body?: string
          message_id?: string
          notification_href?: string | null
          notification_id?: string | null
          recipient_role?: string
          recipient_user_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_huddle_case_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_huddle_case_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_comment_supports: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_comment_supports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "thread_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_comment_supports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_comment_supports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          images: string[] | null
          parent_comment_id: string | null
          text: string
          thread_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string | null
          id?: string
          images?: string[] | null
          parent_comment_id?: string | null
          text: string
          thread_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          images?: string[] | null
          parent_comment_id?: string | null
          text?: string
          thread_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "thread_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_supports: {
        Row: {
          created_at: string
          id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_supports_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_supports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_supports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          alert_type: string | null
          clicks: number | null
          content: string
          created_at: string | null
          hashtags: string[] | null
          id: string
          images: string[] | null
          is_map_alert: boolean
          is_public: boolean
          is_sensitive: boolean
          likes: number | null
          map_id: string | null
          provider_video_id: string | null
          score: number | null
          tags: string[] | null
          title: string
          user_id: string
          video_duration_seconds: number | null
          video_embed_url: string | null
          video_playback_url: string | null
          video_preview_url: string | null
          video_provider: string | null
          video_status: string | null
          video_thumbnail_url: string | null
        }
        Insert: {
          alert_type?: string | null
          clicks?: number | null
          content: string
          created_at?: string | null
          hashtags?: string[] | null
          id?: string
          images?: string[] | null
          is_map_alert?: boolean
          is_public?: boolean
          is_sensitive?: boolean
          likes?: number | null
          map_id?: string | null
          provider_video_id?: string | null
          score?: number | null
          tags?: string[] | null
          title: string
          user_id: string
          video_duration_seconds?: number | null
          video_embed_url?: string | null
          video_playback_url?: string | null
          video_preview_url?: string | null
          video_provider?: string | null
          video_status?: string | null
          video_thumbnail_url?: string | null
        }
        Update: {
          alert_type?: string | null
          clicks?: number | null
          content?: string
          created_at?: string | null
          hashtags?: string[] | null
          id?: string
          images?: string[] | null
          is_map_alert?: boolean
          is_public?: boolean
          is_sensitive?: boolean
          likes?: number | null
          map_id?: string | null
          provider_video_id?: string | null
          score?: number | null
          tags?: string[] | null
          title?: string
          user_id?: string
          video_duration_seconds?: number | null
          video_embed_url?: string | null
          video_playback_url?: string | null
          video_preview_url?: string | null
          video_provider?: string | null
          video_status?: string | null
          video_thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "broadcast_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          escrow_status: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          status: string | null
          stripe_event_id: string
          stripe_session_id: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          escrow_status?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          status?: string | null
          stripe_event_id: string
          stripe_session_id?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          escrow_status?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          status?: string | null
          stripe_event_id?: string
          stripe_session_id?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      triage_cache: {
        Row: {
          ai_response: Json | null
          expires_at: string | null
          first_cached_at: string
          hazard_type: string | null
          hit_count: number | null
          id: string
          image_hash: string
          immediate_action: string | null
          is_hazard: boolean
          last_accessed_at: string
          object_identified: string
          toxicity_level: string | null
        }
        Insert: {
          ai_response?: Json | null
          expires_at?: string | null
          first_cached_at?: string
          hazard_type?: string | null
          hit_count?: number | null
          id?: string
          image_hash: string
          immediate_action?: string | null
          is_hazard: boolean
          last_accessed_at?: string
          object_identified: string
          toxicity_level?: string | null
        }
        Update: {
          ai_response?: Json | null
          expires_at?: string | null
          first_cached_at?: string
          hazard_type?: string | null
          hit_count?: number | null
          id?: string
          image_hash?: string
          immediate_action?: string | null
          is_hazard?: boolean
          last_accessed_at?: string
          object_identified?: string
          toxicity_level?: string | null
        }
        Relationships: []
      }
      typing_indicators: {
        Row: {
          chat_id: string
          id: string
          started_at: string | null
          user_id: string
        }
        Insert: {
          chat_id: string
          id?: string
          started_at?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string
          id?: string
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_indicators_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          accuracy_meters: number | null
          expires_at: string | null
          id: string
          is_public: boolean | null
          location: unknown
          location_name: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          location: unknown
          location_name?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          expires_at?: string | null
          id?: string
          is_public?: boolean | null
          location?: unknown
          location_name?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_moderation: {
        Row: {
          automation_paused: boolean
          banned_at: string | null
          banned_by: string | null
          case_status: string
          created_at: string
          metadata: Json
          moderation_state: string
          public_message: string
          reason_internal: string | null
          restriction_flags: Json
          unbanned_at: string | null
          unbanned_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          automation_paused?: boolean
          banned_at?: string | null
          banned_by?: string | null
          case_status?: string
          created_at?: string
          metadata?: Json
          moderation_state?: string
          public_message?: string
          reason_internal?: string | null
          restriction_flags?: Json
          unbanned_at?: string | null
          unbanned_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          automation_paused?: boolean
          banned_at?: string | null
          banned_by?: string | null
          case_status?: string
          created_at?: string
          metadata?: Json
          moderation_state?: string
          public_message?: string
          reason_internal?: string | null
          restriction_flags?: Json
          unbanned_at?: string | null
          unbanned_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_moderation_restrictions: {
        Row: {
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          enabled_at: string
          enabled_by: string | null
          expires_at: string
          id: string
          metadata: Json
          note: string | null
          restriction_key: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          enabled_at?: string
          enabled_by?: string | null
          expires_at: string
          id?: string
          metadata?: Json
          note?: string | null
          restriction_key: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          enabled_at?: string
          enabled_by?: string | null
          expires_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          restriction_key?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_moderation_restrictions_disabled_by_fkey"
            columns: ["disabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_restrictions_disabled_by_fkey"
            columns: ["disabled_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_restrictions_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_restrictions_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_restrictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_restrictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_quotas: {
        Row: {
          ai_vet_uploads_today: number
          broadcast_alerts_week: number
          broadcast_month_used: number
          broadcast_week_used: number
          day_start: string
          discovery_profiles_today: number
          discovery_views_today: number
          extra_broadcast_72h: number
          extra_media_10: number
          extra_stars: number
          extras_ai_vet_uploads: number
          extras_broadcasts: number
          extras_stars: number
          media_usage_today: number
          month_start: string
          priority_analyses_month_used: number
          stars_month_used: number
          stars_used_cycle: number
          thread_posts_today: number
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          ai_vet_uploads_today?: number
          broadcast_alerts_week?: number
          broadcast_month_used?: number
          broadcast_week_used?: number
          day_start?: string
          discovery_profiles_today?: number
          discovery_views_today?: number
          extra_broadcast_72h?: number
          extra_media_10?: number
          extra_stars?: number
          extras_ai_vet_uploads?: number
          extras_broadcasts?: number
          extras_stars?: number
          media_usage_today?: number
          month_start?: string
          priority_analyses_month_used?: number
          stars_month_used?: number
          stars_used_cycle?: number
          thread_posts_today?: number
          updated_at?: string
          user_id: string
          week_start?: string
        }
        Update: {
          ai_vet_uploads_today?: number
          broadcast_alerts_week?: number
          broadcast_month_used?: number
          broadcast_week_used?: number
          day_start?: string
          discovery_profiles_today?: number
          discovery_views_today?: number
          extra_broadcast_72h?: number
          extra_media_10?: number
          extra_stars?: number
          extras_ai_vet_uploads?: number
          extras_broadcasts?: number
          extras_stars?: number
          media_usage_today?: number
          month_start?: string
          priority_analyses_month_used?: number
          stars_month_used?: number
          stars_used_cycle?: number
          thread_posts_today?: number
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quotas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_quotas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_quotas_legacy_20260208: {
        Row: {
          ai_images: number
          chat_images: number
          created_at: string
          day: string
          id: string
          thread_posts: number
          user_id: string
        }
        Insert: {
          ai_images?: number
          chat_images?: number
          created_at?: string
          day?: string
          id?: string
          thread_posts?: number
          user_id: string
        }
        Update: {
          ai_images?: number
          chat_images?: number
          created_at?: string
          day?: string
          id?: string
          thread_posts?: number
          user_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          attachment_urls: string[]
          categories: string[]
          created_at: string
          details: string | null
          id: string
          is_scored: boolean
          reporter_id: string
          score: number
          source_origin: string | null
          target_id: string
          window_start: string
        }
        Insert: {
          attachment_urls?: string[]
          categories?: string[]
          created_at?: string
          details?: string | null
          id?: string
          is_scored?: boolean
          reporter_id: string
          score?: number
          source_origin?: string | null
          target_id: string
          window_start?: string
        }
        Update: {
          attachment_urls?: string[]
          categories?: string[]
          created_at?: string
          details?: string | null
          id?: string
          is_scored?: boolean
          reporter_id?: string
          score?: number
          source_origin?: string | null
          target_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_safety_metric_resets: {
        Row: {
          false_report_count_offset: number
          note: string | null
          penalty_count_offset: number
          penalty_score_offset: number
          updated_at: string
          updated_by: string
          user_id: string
        }
        Insert: {
          false_report_count_offset?: number
          note?: string | null
          penalty_count_offset?: number
          penalty_score_offset?: number
          updated_at?: string
          updated_by: string
          user_id: string
        }
        Update: {
          false_report_count_offset?: number
          note?: string | null
          penalty_count_offset?: number
          penalty_score_offset?: number
          updated_at?: string
          updated_by?: string
          user_id?: string
        }
        Relationships: []
      }
      user_unmatches: {
        Row: {
          actor_id: string
          chat_id: string | null
          created_at: string
          id: string
          target_id: string
        }
        Insert: {
          actor_id: string
          chat_id?: string | null
          created_at?: string
          id?: string
          target_id: string
        }
        Update: {
          actor_id?: string
          chat_id?: string | null
          created_at?: string
          id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unmatches_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unmatches_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unmatches_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unmatches_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unmatches_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          performed_by: string | null
          verification_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          performed_by?: string | null
          verification_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          performed_by?: string | null
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_audit_log_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verification_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          created_at: string | null
          document_number_hash: string | null
          document_type: string | null
          expires_at: string | null
          id: string
          provider: string | null
          provider_request_id: string | null
          rejection_reason: string | null
          request_type: string
          reviewed_by: string | null
          status: string | null
          submitted_data: Json | null
          updated_at: string | null
          user_id: string
          verification_result: Json | null
        }
        Insert: {
          created_at?: string | null
          document_number_hash?: string | null
          document_type?: string | null
          expires_at?: string | null
          id?: string
          provider?: string | null
          provider_request_id?: string | null
          rejection_reason?: string | null
          request_type: string
          reviewed_by?: string | null
          status?: string | null
          submitted_data?: Json | null
          updated_at?: string | null
          user_id: string
          verification_result?: Json | null
        }
        Update: {
          created_at?: string | null
          document_number_hash?: string | null
          document_type?: string | null
          expires_at?: string | null
          id?: string
          provider?: string | null
          provider_request_id?: string | null
          rejection_reason?: string | null
          request_type?: string
          reviewed_by?: string | null
          status?: string | null
          submitted_data?: Json | null
          updated_at?: string | null
          user_id?: string
          verification_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_uploads: {
        Row: {
          country: string | null
          document_type: string
          document_url: string
          id: string
          legal_name: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_url: string | null
          status: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          country?: string | null
          document_type: string
          document_url: string
          id?: string
          legal_name?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          status?: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          country?: string | null
          document_type?: string
          document_url?: string
          id?: string
          legal_name?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          status?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_uploads_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_uploads_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      waves: {
        Row: {
          created_at: string | null
          from_user_id: string | null
          id: string
          message: string | null
          receiver_id: string
          responded_at: string | null
          sender_id: string
          status: string | null
          to_user_id: string | null
          wave_type: string | null
        }
        Insert: {
          created_at?: string | null
          from_user_id?: string | null
          id?: string
          message?: string | null
          receiver_id: string
          responded_at?: string | null
          sender_id: string
          status?: string | null
          to_user_id?: string | null
          wave_type?: string | null
        }
        Update: {
          created_at?: string | null
          from_user_id?: string | null
          id?: string
          message?: string | null
          receiver_id?: string
          responded_at?: string | null
          sender_id?: string
          status?: string | null
          to_user_id?: string | null
          wave_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waves_from_user_fk"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_from_user_fk"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_to_user_fk"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_to_user_fk"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      crm_contacts_view: {
        Row: {
          ACTIVITY_BUCKET: string | null
          COUNTRY: string | null
          DISPLAY_NAME: string | null
          DISTRICT: string | null
          EMAIL: string | null
          HAS_CAT: string | null
          HAS_DOG: string | null
          HAS_OTHERS: string | null
          HAS_PET: string | null
          LAST_ACTIVE_AT: string | null
          LAST_BOOKING_AT: string | null
          LAST_BROADCAST_AT: string | null
          LAST_CHAT_AT: string | null
          MARKETING_CONSENT: string | null
          MARKETING_DOI_CONFIRMED: string | null
          MARKETING_OPT_IN: string | null
          PET_COUNT: number | null
          PET_TYPES: string | null
          PHONE: string | null
          SERVICE_PROVIDER: string | null
          SOCIAL_ID: string | null
          SUBSCRIPTION_STATUS: string | null
          TIER: string | null
          TRUST_SCORE: number | null
          TRUST_TIER: string | null
          USER_CREATED_AT: string | null
          VERIFICATION_STATUS: string | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      phone_otp_daily_summary: {
        Row: {
          date: string | null
          failed: number | null
          rate_limited: number | null
          send_count: number | null
          successful: number | null
          suspicious: number | null
          total_attempts: number | null
          unique_ips: number | null
          unique_phones: number | null
          unique_users: number | null
          verify_count: number | null
        }
        Relationships: []
      }
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
          is_verified: boolean | null
          languages: string[] | null
          location_name: string | null
          major: string | null
          owns_pets: boolean | null
          pet_experience: string[] | null
          relationship_status: string | null
          school: string | null
          social_availability: boolean | null
          user_role: string | null
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
          is_verified?: boolean | null
          languages?: string[] | null
          location_name?: string | null
          major?: never
          owns_pets?: boolean | null
          pet_experience?: string[] | null
          relationship_status?: string | null
          school?: never
          social_availability?: boolean | null
          user_role?: string | null
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
          is_verified?: boolean | null
          languages?: string[] | null
          location_name?: string | null
          major?: never
          owns_pets?: boolean | null
          pet_experience?: string[] | null
          relationship_status?: string | null
          school?: never
          social_availability?: boolean | null
          user_role?: string | null
          weight?: never
          weight_unit?: string | null
        }
        Relationships: []
      }
      view_admin_report_casefile: {
        Row: {
          attachment_urls: string[] | null
          automation_paused: boolean | null
          case_status: string | null
          categories: string[] | null
          details: string | null
          moderation_note: string | null
          moderation_state: string | null
          report_created_at: string | null
          report_id: string | null
          reporter_display_name: string | null
          reporter_false_report_count: number | null
          reporter_social_id: string | null
          reporter_user_id: string | null
          restriction_flags: Json | null
          score: number | null
          source_origin: string | null
          support_created_at: string | null
          support_message: string | null
          support_request_id: string | null
          support_subject: string | null
          target_display_name: string | null
          target_social_id: string | null
          target_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      view_admin_reports_queue: {
        Row: {
          automation_paused: boolean | null
          case_status: string | null
          category_tags: string[] | null
          has_attachments: boolean | null
          latest_action: string | null
          latest_action_at: string | null
          latest_action_by_display_name: string | null
          latest_action_by_id: string | null
          latest_action_source: string | null
          latest_report_at: string | null
          latest_report_source: string | null
          latest_support_created_at: string | null
          latest_support_message: string | null
          latest_support_subject: string | null
          moderation_state: string | null
          report_count: number | null
          restriction_flags: Json | null
          target_display_name: string | null
          target_social_id: string | null
          target_user_id: string | null
          total_score: number | null
          unique_reporters: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["latest_action_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["latest_action_by_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      view_admin_safety_audit_timeline: {
        Row: {
          action: string | null
          action_source: string | null
          actor_display_name: string | null
          actor_id: string | null
          audit_id: string | null
          created_at: string | null
          details: Json | null
          notes: string | null
          target_display_name: string | null
          target_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      view_admin_safety_user_timeline: {
        Row: {
          description: string | null
          event_date: string | null
          event_group: string | null
          event_type: string | null
          related_id: string | null
          severity: string | null
          source: string | null
          user_id: string | null
        }
        Relationships: []
      }
      view_admin_safety_users: {
        Row: {
          automation_paused: boolean | null
          case_status: string | null
          cumulative_penalty_score: number | null
          display_name: string | null
          disputes_involved: number | null
          false_report_count: number | null
          is_banned_effective: boolean | null
          latest_safety_activity: string | null
          moderation_adjustment: number | null
          moderation_state: string | null
          penalty_count: number | null
          reports_filed: number | null
          reports_received: number | null
          social_id: string | null
          trust_score: number | null
          trust_weight: number | null
          user_id: string | null
        }
        Relationships: []
      }
      view_admin_service_disputes_queue: {
        Row: {
          chat_status: string | null
          currency_code: string | null
          customer_platform_fee_amount: number | null
          customer_refund_amount: number | null
          decision_action: string | null
          decision_actor_id: string | null
          decision_at: string | null
          decision_note: string | null
          decision_payload: Json | null
          decision_version: number | null
          dispute_category: string | null
          dispute_created_at: string | null
          dispute_id: string | null
          dispute_status: string | null
          dispute_updated_at: string | null
          evidence_count: number | null
          evidence_urls: string[] | null
          filed_by: string | null
          huddle_retained_amount: number | null
          payout_release_requested_at: string | null
          payout_released_at: string | null
          platform_fee_amount: number | null
          provider_display_name: string | null
          provider_id: string | null
          provider_platform_fee_amount: number | null
          provider_receives_amount: number | null
          provider_social_id: string | null
          request_opened_at: string | null
          requester_display_name: string | null
          requester_id: string | null
          requester_social_id: string | null
          service_chat_id: string | null
          service_rate_amount: number | null
          stripe_payment_intent_id: string | null
          total_paid_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_disputes_decision_actor_id_fkey"
            columns: ["decision_actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_disputes_decision_actor_id_fkey"
            columns: ["decision_actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_disputes_service_chat_id_fkey"
            columns: ["service_chat_id"]
            isOneToOne: false
            referencedRelation: "service_chats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _native_family_profile_json: {
        Args: { p_user_id: string }
        Returns: Json
      }
      _native_family_slot_limit: {
        Args: { p_owner_id: string }
        Returns: number
      }
      _native_family_used_slots: {
        Args: { p_owner_id: string }
        Returns: number
      }
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _qms_cycle_month_start: { Args: { p_owner_id: string }; Returns: string }
      _qms_effective_tier: { Args: { p_user_id: string }; Returns: string }
      _qms_get_pool_owner: { Args: { p_user_id: string }; Returns: string }
      _qms_refresh_effective_tier_for_seed: {
        Args: { p_seed_user_id: string }
        Returns: undefined
      }
      _qms_touch_row: { Args: { p_owner_id: string }; Returns: undefined }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_group_chat_invite: {
        Args: { p_chat_id: string }
        Returns: {
          joined: boolean
          joined_chat_id: string
        }[]
      }
      accept_group_chat_invite_by_id: {
        Args: { p_invite_id: string }
        Returns: {
          joined: boolean
          joined_chat_id: string
        }[]
      }
      accept_mutual_wave: {
        Args: { p_target_user_id: string }
        Returns: {
          match_created: boolean
        }[]
      }
      accept_native_family_invite: {
        Args: { p_family_member_id: string }
        Returns: Json
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_apply_dispute_decision: {
        Args: {
          p_action: string
          p_customer_refund_amount?: number
          p_dispute_id: string
          p_note: string
          p_waive_customer_platform_fee?: boolean
          p_waive_provider_platform_fee?: boolean
        }
        Returns: Json
      }
      admin_apply_report_moderation: {
        Args: {
          p_action: string
          p_note?: string
          p_pause_sentinel?: boolean
          p_reporter_user_id?: string
          p_restriction_flags?: Json
          p_target_user_id: string
          p_warn_message?: string
        }
        Returns: Json
      }
      admin_ban_user: {
        Args: {
          p_block_email?: boolean
          p_block_phone?: boolean
          p_metadata?: Json
          p_public_message?: string
          p_reason_internal?: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_clear_user_restrictions: {
        Args: { p_note?: string; p_target_user_id: string }
        Returns: Json
      }
      admin_get_service_chat_preview: {
        Args: { p_service_chat_id: string }
        Returns: Json
      }
      admin_get_team_huddle_correspondence: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          case_id: string
          case_type: string
          chat_id: string
          created_at: string
          is_team_huddle: boolean
          message_body: string
          message_id: string
          recipient_role: string
          sender_display_name: string
          sender_social_id: string
          sender_user_id: string
        }[]
      }
      admin_reset_user_safety_record: {
        Args: { p_note?: string; p_target_user_id: string }
        Returns: Json
      }
      admin_resolve_service_care_issue_event: {
        Args: { p_event_id: string; p_resolution: string }
        Returns: Json
      }
      admin_review_verification: {
        Args: {
          p_comment: string
          p_status: Database["public"]["Enums"]["verification_status_enum"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_send_team_huddle_case_message: {
        Args: {
          p_case_id: string
          p_case_type: string
          p_idempotency_key: string
          p_message_body: string
          p_recipient_role: string
          p_recipient_user_id: string
        }
        Returns: Json
      }
      admin_set_user_restriction: {
        Args: {
          p_enabled: boolean
          p_note?: string
          p_restriction_key: string
          p_source?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_unban_user: {
        Args: {
          p_clear_identifiers?: boolean
          p_metadata?: Json
          p_user_id: string
        }
        Returns: Json
      }
      admin_upsert_abuse_signal: {
        Args: {
          p_cooldown_until?: string
          p_metadata?: Json
          p_reason_internal?: string
          p_review_required?: boolean
          p_risk_level?: string
          p_signal_type: string
          p_signal_value: string
          p_source_user_id?: string
        }
        Returns: Json
      }
      approve_group_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      archive_broadcast_alert: {
        Args: { p_actor_id: string; p_alert_id: string }
        Returns: string
      }
      archive_chat_for_current_user: {
        Args: { p_chat_id: string }
        Returns: Json
      }
      assert_active_direct_match: {
        Args: { p_actor_user_id: string; p_target_user_id: string }
        Returns: undefined
      }
      block_user: { Args: { p_blocked_id: string }; Returns: undefined }
      broadcast_notification_queue_delay: { Args: never; Returns: string }
      build_aggregation_copy: {
        Args: { p_actor_names: string[]; p_count: number; p_kind: string }
        Returns: string
      }
      can_deliver_notification: {
        Args: { p_category: string; p_user_id: string }
        Returns: boolean
      }
      can_request_service_from_provider: {
        Args: { p_provider_id: string }
        Returns: boolean
      }
      can_write_native_group_avatar: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      cancel_native_family_invite: {
        Args: { p_family_member_id: string }
        Returns: Json
      }
      cancel_native_group_invite: {
        Args: { p_chat_id: string; p_invite_id: string }
        Returns: boolean
      }
      chat_attachment_room_id: {
        Args: { object_name: string }
        Returns: string
      }
      chat_message_attachment_paths: {
        Args: { p_content: string }
        Returns: {
          bucket: string
          object_path: string
        }[]
      }
      chat_retention_cleanup_apply: {
        Args: { p_now?: string }
        Returns: {
          chat_id: string
          delete_reason: string
          item_type: string
          media_path: string
          message_id: string
        }[]
      }
      chat_retention_cleanup_preview: {
        Args: { p_now?: string }
        Returns: {
          chat_id: string
          created_at: string
          delete_reason: string
          item_type: string
          media_path: string
          message_id: string
        }[]
      }
      check_and_increment_quota: {
        Args: { action_type: string }
        Returns: boolean
      }
      check_blocked_identity_verification: {
        Args: {
          p_card_fingerprint: string
          p_card_last4: string
          p_legal_name: string
        }
        Returns: Json
      }
      check_identifier_mfa: { Args: { p_email: string }; Returns: Json }
      check_identifier_registered: {
        Args: { p_email?: string; p_phone?: string }
        Returns: Json
      }
      check_link_preview_rate_limit: {
        Args: {
          p_client_ip: string
          p_ip_limit?: number
          p_user_id?: string
          p_user_limit?: number
        }
        Returns: {
          ip_count: number
          ip_reset_at: string
          is_limited: boolean
          reason: string
          retry_after_seconds: number
          user_count: number
          user_reset_at: string
        }[]
      }
      check_native_direct_relationship: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      check_phone_otp_rate_limit: {
        Args: { p_ip: string; p_phone_hash: string; p_user_id: string }
        Returns: {
          ip_cnt: number
          is_limited: boolean
          phone_cnt: number
          reason: string
          seconds_until_allow: number
          user_cnt: number
        }[]
      }
      check_professional_credential_registry: {
        Args: { p_credential_id: string }
        Returns: Json
      }
      check_scan_rate_limit: { Args: { user_uuid: string }; Returns: boolean }
      cleanup_chat_attachments_tmp: { Args: never; Returns: undefined }
      cleanup_expired_broadcast_alerts: { Args: never; Returns: number }
      cleanup_expired_map_alerts: { Args: never; Returns: number }
      clear_user_location_pin: { Args: never; Returns: undefined }
      complete_service_if_both_confirmed: {
        Args: { p_chat_id: string }
        Returns: undefined
      }
      create_alert_thread_and_pin: { Args: { payload: Json }; Returns: Json }
      create_native_family_invite: {
        Args: { p_invitee_user_id: string }
        Returns: Json
      }
      create_native_group_chat: {
        Args: {
          p_avatar_url?: string
          p_description?: string
          p_invite_user_ids?: string[]
          p_join_method?: string
          p_location_country?: string
          p_location_label?: string
          p_name: string
          p_pet_focus?: string[]
          p_visibility?: string
        }
        Returns: {
          id: string
          name: string
          room_code: string
        }[]
      }
      create_native_service_chat: {
        Args: { p_provider_user_id: string }
        Returns: string
      }
      create_native_social_comment: {
        Args: {
          p_content?: string
          p_images?: string[]
          p_parent_comment_id?: string
          p_thread_id: string
        }
        Returns: string
      }
      create_native_social_thread: {
        Args: {
          p_category: string
          p_content: string
          p_images?: string[]
          p_is_sensitive?: boolean
          p_title: string
          p_video?: Json
        }
        Returns: string
      }
      create_service_chat: { Args: { p_provider_id: string }; Returns: string }
      create_thread_mention_notifications: {
        Args: {
          p_actor_id: string
          p_recipient_ids: string[]
          p_thread_id: string
        }
        Returns: boolean
      }
      credential_identifier_hmac: {
        Args: { p_identifier: string }
        Returns: string
      }
      credential_identifier_matches_hmac: {
        Args: { p_candidate_identifier: string; p_expected_hmac: string }
        Returns: boolean
      }
      credential_mask_identifier: {
        Args: { p_identifier: string }
        Returns: string
      }
      credential_method_for_status: {
        Args: {
          p_status: Database["public"]["Enums"]["professional_credential_status"]
        }
        Returns: Database["public"]["Enums"]["credential_verification_method"]
      }
      credential_normalize_text: { Args: { p_value: string }; Returns: string }
      credential_public_label: {
        Args: {
          p_status: Database["public"]["Enums"]["professional_credential_status"]
        }
        Returns: string
      }
      debug_whoami: {
        Args: never
        Returns: {
          auth_uid: string
          current_user_name: string
          session_user_name: string
        }[]
      }
      decline_group_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      decline_native_family_invite: {
        Args: { p_family_member_id: string }
        Returns: Json
      }
      decline_native_group_invite: {
        Args: { p_chat_id?: string; p_invite_id?: string }
        Returns: boolean
      }
      delete_broadcast_alert:
        | { Args: { p_alert_id: string }; Returns: boolean }
        | { Args: { p_actor_id: string; p_alert_id: string }; Returns: string }
      delete_native_social_comment: {
        Args: { p_comment_id: string }
        Returns: boolean
      }
      delete_social_thread: { Args: { p_thread_id: string }; Returns: boolean }
      delete_user_account: { Args: { p_user_id: string }; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      downgrade_user_tier: { Args: { p_user_id: string }; Returns: undefined }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_broadcast_notifications: {
        Args: { p_alert_id: string }
        Returns: number
      }
      enqueue_chat_notification: {
        Args: {
          p_body: string
          p_data?: Json
          p_href: string
          p_kind: string
          p_recipient_id: string
          p_title: string
        }
        Returns: undefined
      }
      enqueue_notification: {
        Args: {
          p_body: string
          p_category: string
          p_data?: Json
          p_href: string
          p_kind: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      ensure_direct_chat_room: {
        Args: { p_target_name?: string; p_target_user_id: string }
        Returns: string
      }
      ensure_direct_chat_room_for_users: {
        Args: {
          p_actor_user_id: string
          p_target_name?: string
          p_target_user_id: string
        }
        Returns: string
      }
      ensure_star_direct_chat_room: {
        Args: { p_target_name?: string; p_target_user_id: string }
        Returns: string
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      expire_account_restrictions: { Args: never; Returns: undefined }
      extract_country_from_location_label: {
        Args: { p_label: string }
        Returns: string
      }
      file_booking_dispute: {
        Args: { p_booking_id: string; p_dispute_reason: string }
        Returns: undefined
      }
      file_service_dispute: {
        Args: {
          p_category: string
          p_chat_id: string
          p_description: string
          p_evidence_urls: string[]
        }
        Returns: string
      }
      finalize_identity_submission: {
        Args: {
          p_country: string
          p_doc_path: string
          p_doc_type: string
          p_legal_name: string
          p_selfie_path: string
        }
        Returns: undefined
      }
      find_nearby_users: {
        Args: {
          alert_lat: number
          alert_lng: number
          min_vouch_score?: number
          radius_meters?: number
        }
        Returns: {
          display_name: string
          distance_meters: number
          fcm_token: string
          id: string
          vouch_score: number
        }[]
      }
      finish_professional_credential_check: {
        Args: {
          p_check_id: string
          p_confidence?: Database["public"]["Enums"]["credential_confidence"]
          p_edge_function_run_id?: string
          p_error_code?: string
          p_error_message?: string
          p_match_result?: Json
          p_matched_fields?: Json
          p_raw_result_redacted?: Json
          p_status_after: Database["public"]["Enums"]["professional_credential_status"]
        }
        Returns: Json
      }
      freeze_chat_for_report: {
        Args: {
          p_chat_id: string
          p_report_id?: string
          p_reported_message_id?: string
        }
        Returns: string
      }
      generate_uid: { Args: { len: number }; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_active_service_provider_ids_for_viewer: {
        Args: never
        Returns: {
          chat_id: string
          provider_id: string
          service_status: string
        }[]
      }
      get_broadcast_alert_by_id: {
        Args: { p_alert_id: string }
        Returns: {
          alert_type: string
          created_at: string
          creator_avatar_url: string
          creator_display_name: string
          creator_id: string
          creator_social_id: string
          description: string
          duration_hours: number
          expires_at: string
          id: string
          is_sensitive: boolean
          latitude: number
          location_district: string
          location_street: string
          longitude: number
          marker_state: string
          media_urls: string[]
          photo_url: string
          post_on_social: boolean
          posted_to_threads: boolean
          range_km: number
          range_meters: number
          report_count: number
          social_post_id: string
          social_status: string
          social_url: string
          support_count: number
          thread_id: string
          title: string
        }[]
      }
      get_chat_inbox_summaries: {
        Args: {
          p_chat_ids?: string[]
          p_cursor?: string
          p_limit?: number
          p_only_with_activity?: boolean
          p_scope?: string
        }
        Returns: {
          activity_ts: string
          avatar_url: string
          blocked_by_me: boolean
          blocked_by_them: boolean
          chat_id: string
          chat_name: string
          created_at: string
          created_by: string
          description: string
          join_method: string
          last_message_at: string
          last_message_content: string
          last_message_id: string
          last_message_read_by_other: boolean
          last_message_sender_id: string
          last_message_sender_name: string
          location_country: string
          location_label: string
          matched_at: string
          member_count: number
          peer_availability_label: string
          peer_avatar_url: string
          peer_has_car: boolean
          peer_is_verified: boolean
          peer_name: string
          peer_social_id: string
          peer_user_id: string
          pet_focus: string[]
          room_code: string
          room_type: string
          service_provider_id: string
          service_provider_skills: string[]
          service_request_card: Json
          service_requester_id: string
          service_status: string
          shape_issue: string
          unmatched_by_me: boolean
          unmatched_by_them: boolean
          unread_count: number
          visibility: string
        }[]
      }
      get_chat_inbox_unread_total: { Args: never; Returns: number }
      get_chat_invariant_diagnostics: {
        Args: never
        Returns: {
          chat_id: string
          details: Json
          issue: string
        }[]
      }
      get_discovery_cards: {
        Args: { p_filters?: Json }
        Returns: {
          age_years: number
          availability_status: string
          avatar_url: string
          created_at: string
          display_name: string
          effective_tier: string
          experience_years: number
          gender_genre: string
          has_car: boolean
          height: number
          id: string
          is_verified: boolean
          last_active_at: string
          location_country: string
          location_name: string
          pet_experience: string[]
          pet_experience_years: number
          pet_size: string
          pet_species: string[]
          photos: Json
          relationship_status: string
          score: number
          tier: string
          updated_at: string
          verification_status: string
          waved_at_viewer: boolean
        }[]
      }
      get_friend_pins_nearby: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: {
          avatar_url: string
          display_name: string
          dob: string
          id: string
          last_lat: number
          last_lng: number
          location_name: string
          location_pinned_until: string
          location_retention_until: string
          marker_state: string
          owns_pets: boolean
          pet_species: string[]
          relationship_status: string
        }[]
      }
      get_group_invite_previews: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          chat_id: string
          chat_name: string
          created_at: string
          created_by: string
          description: string
          invite_id: string
          inviter_name: string
          join_method: string
          last_message_at: string
          location_country: string
          location_label: string
          member_count: number
          pet_focus: string[]
          room_code: string
          visibility: string
        }[]
      }
      get_map_alerts_nearby: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: {
          alert_type: string
          created_at: string
          creator_avatar_url: string
          creator_display_name: string
          description: string
          expires_at: string
          id: string
          latitude: number
          longitude: number
          photo_url: string
          range_meters: number
          report_count: number
          support_count: number
        }[]
      }
      get_my_active_restrictions: { Args: never; Returns: Json }
      get_my_professional_credentials: { Args: never; Returns: Json }
      get_native_chat_dialogue_snapshot: {
        Args: {
          p_before_created_at?: string
          p_chat_id: string
          p_limit?: number
        }
        Returns: Json
      }
      get_native_chat_profile_summaries: {
        Args: { p_user_ids: string[] }
        Returns: {
          availability_status: string[]
          avatar_url: string
          display_name: string
          has_car: boolean
          id: string
          is_verified: boolean
          social_id: string
          user_role: string
          verification_status: string
        }[]
      }
      get_native_chat_read_receipts: {
        Args: { p_message_ids: string[] }
        Returns: {
          message_id: string
        }[]
      }
      get_native_chat_viewer_snapshot: { Args: never; Returns: Json }
      get_native_family_account_state: { Args: never; Returns: Json }
      get_native_group_invite_chat_id: {
        Args: { p_invite_id: string }
        Returns: Json
      }
      get_native_group_manage_snapshot: {
        Args: { p_chat_id: string }
        Returns: Json
      }
      get_native_group_management_snapshot: {
        Args: { p_chat_id: string }
        Returns: Json
      }
      get_native_group_member_state: {
        Args: { p_chat_id: string }
        Returns: {
          is_muted: boolean
          role: string
        }[]
      }
      get_native_group_members: {
        Args: { p_chat_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          is_verified: boolean
          role: string
          user_id: string
          verification_status: string
        }[]
      }
      get_native_map_blocked_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      get_native_matched_fallback_target: {
        Args: { p_chat_id: string }
        Returns: Json
      }
      get_native_matched_rail_summary: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          chat_id: string
          display_name: string
          is_verified: boolean
          matched_at: string
          peer_user_id: string
          social_id: string
          verification_status: string
        }[]
      }
      get_native_onboarding_snapshot: {
        Args: never
        Returns: {
          active_pet_count: number
          onboarding_completed: boolean
          owns_pets: boolean
          profile_exists: boolean
        }[]
      }
      get_native_profile_summary: { Args: never; Returns: Json }
      get_native_public_profile_pet: {
        Args: { p_owner_id?: string; p_pet_id?: string }
        Returns: Json
      }
      get_native_public_profile_relationship: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      get_native_public_profile_snapshot: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_native_seen_match_ids: {
        Args: never
        Returns: {
          matched_user_id: string
        }[]
      }
      get_native_service_provider_cards:
        | {
            Args: { p_lat?: number; p_lng?: number; p_viewer_country?: string }
            Returns: {
              area_name: string
              avatar_url: string
              created_at: string
              currency: string
              days: string[]
              display_name: string
              distance_km: number
              dog_sizes: string[]
              emergency_readiness: boolean
              has_car: boolean
              is_bookmarked: boolean
              is_verified: boolean
              location_country: string
              location_styles: string[]
              min_notice_unit: string
              min_notice_value: number
              other_time_from: string
              other_time_to: string
              pet_types: string[]
              pet_types_other: string
              proof_metadata: Json
              rates: string[]
              services_offered: string[]
              services_other: string
              skills: string[]
              starting_price: number
              story: string
              time_blocks: string[]
              updated_at: string
              user_id: string
              verification_status: string
              vet_license_found: boolean
            }[]
          }
        | {
            Args: {
              p_lat?: number
              p_lng?: number
              p_viewer_country?: string
              p_viewer_scope?: Json
            }
            Returns: {
              area_name: string
              avatar_url: string
              created_at: string
              currency: string
              days: string[]
              display_name: string
              distance_km: number
              dog_sizes: string[]
              emergency_readiness: boolean
              has_car: boolean
              is_bookmarked: boolean
              is_verified: boolean
              location_country: string
              location_styles: string[]
              min_notice_unit: string
              min_notice_value: number
              other_time_from: string
              other_time_to: string
              pet_types: string[]
              pet_types_other: string
              proof_metadata: Json
              public_credential_badges: Json
              rates: string[]
              services_offered: string[]
              services_other: string
              skills: string[]
              starting_price: number
              story: string
              time_blocks: string[]
              updated_at: string
              user_id: string
              verification_status: string
              vet_license_found: boolean
            }[]
          }
      get_native_service_provider_detail: {
        Args: { p_provider_user_id: string }
        Returns: Json
      }
      get_native_social_block_relationship: {
        Args: { p_target_user_id: string }
        Returns: boolean
      }
      get_native_social_blocked_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      get_native_social_comments: {
        Args: {
          p_before_created_at?: string
          p_limit?: number
          p_thread_id: string
        }
        Returns: {
          author_avatar_url: string
          author_display_name: string
          author_is_verified: boolean
          author_location_country: string
          author_social_id: string
          author_verification_status: string
          content: string
          created_at: string
          id: string
          images: string[]
          parent_comment_id: string
          reply_mentions: Json
          support_count: number
          thread_id: string
          updated_at: string
          user_id: string
          viewer_supported: boolean
        }[]
      }
      get_native_social_post_preferences: {
        Args: { p_thread_ids: string[] }
        Returns: {
          is_pinned: boolean
          is_saved: boolean
          pinned_at: string
          thread_id: string
        }[]
      }
      get_native_social_supported_thread_ids: {
        Args: { p_thread_ids: string[] }
        Returns: {
          thread_id: string
        }[]
      }
      get_native_social_thread_by_id: {
        Args: { p_thread_id: string }
        Returns: {
          alert_district: string
          alert_type: string
          author_avatar_url: string
          author_display_name: string
          author_location_country: string
          author_non_social: boolean
          author_social_id: string
          author_verification_status: string
          comment_count: number
          content: string
          created_at: string
          has_alert_link: boolean
          hashtags: string[]
          id: string
          images: string[]
          like_count: number
          map_id: string
          provider_video_id: string
          score: number
          support_count: number
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          video_duration_seconds: number
          video_embed_url: string
          video_playback_url: string
          video_preview_url: string
          video_provider: string
          video_status: string
          video_thumbnail_url: string
        }[]
      }
      get_native_verify_identity_profile_snapshot: {
        Args: never
        Returns: Json
      }
      get_native_viewer_group_context: { Args: never; Returns: Json }
      get_native_viewer_scope: {
        Args: never
        Returns: {
          cached_device_point: Json
          country: string
          district: string
          location_name: string
          location_pinned_until: string
          location_retention_until: string
          own_pin_point: Json
          profile_point: Json
          recent_user_point: Json
          user_id: string
        }[]
      }
      get_otp_resend_cooldown: {
        Args: { p_request_count: number }
        Returns: number
      }
      get_phone_otp_request_count: {
        Args: {
          p_hours?: number
          p_ip?: string
          p_phone_hash?: string
          p_user_id?: string
        }
        Returns: {
          cnt: number
          earliest_at: string
        }[]
      }
      get_private_group_by_code: {
        Args: { p_code: string }
        Returns: {
          chat_id: string
          chat_name: string
          description: string
          location_label: string
          member_count: number
          pet_focus: string[]
          room_code: string
        }[]
      }
      get_public_group_preview_members: {
        Args: { p_chat_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          is_verified: boolean
          role: string
          user_id: string
          verification_status: string
        }[]
      }
      get_public_groups_for_country: {
        Args: { p_country: string; p_user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          created_by: string
          description: string
          id: string
          join_method: string
          last_message_at: string
          location_country: string
          location_label: string
          member_count: number
          name: string
          pet_focus: string[]
        }[]
      }
      get_public_groups_for_viewer:
        | {
            Args: never
            Returns: {
              avatar_url: string
              created_at: string
              created_by: string
              description: string
              id: string
              join_method: string
              last_message_at: string
              location_country: string
              location_label: string
              member_count: number
              name: string
              pet_focus: string[]
            }[]
          }
        | {
            Args: { p_country?: string }
            Returns: {
              avatar_url: string
              created_at: string
              created_by: string
              description: string
              id: string
              join_method: string
              last_message_at: string
              location_country: string
              location_label: string
              member_count: number
              name: string
              pet_focus: string[]
            }[]
          }
      get_public_provider_credential_badges: {
        Args: { p_provider_id: string }
        Returns: {
          caveat: string
          checked_at: string
          credential_type: string
          masked_identifier: string
          public_label: string
          source_name: string
          source_type: string
        }[]
      }
      get_quota_snapshot: {
        Args: never
        Returns: {
          broadcast_active_limit: number
          broadcast_active_used: number
          broadcast_alerts_week: number
          day_start: string
          discovery_views_today: number
          extra_broadcast_72h: number
          extra_media_10: number
          extra_stars: number
          media_usage_today: number
          month_start: string
          stars_used_cycle: number
          thread_posts_today: number
          tier: string
          user_id: string
          week_start: string
        }[]
      }
      get_service_provider_distances: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          distance_km: number
          user_id: string
        }[]
      }
      get_share_targets: {
        Args: never
        Returns: {
          avatar: string
          chat_id: string
          interaction_score: number
          last_message_at: string
          last_message_preview: string
          name: string
          room_type: string
          social_id: string
          user_id: string
        }[]
      }
      get_social_feed: {
        Args: {
          p_cursor?: Json
          p_limit?: number
          p_sort?: string
          p_viewer_id: string
          p_viewer_scope?: Json
        }
        Returns: {
          alert_district: string
          alert_type: string
          author_avatar_url: string
          author_display_name: string
          author_location_country: string
          author_non_social: boolean
          author_verification_status: string
          comment_count: number
          content: string
          created_at: string
          has_alert_link: boolean
          hashtags: string[]
          id: string
          images: string[]
          like_count: number
          map_id: string
          provider_video_id: string
          score: number
          support_count: number
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          video_duration_seconds: number
          video_embed_url: string
          video_playback_url: string
          video_preview_url: string
          video_provider: string
          video_status: string
          video_thumbnail_url: string
        }[]
      }
      get_social_feed_alert_context: {
        Args: { p_thread_ids: string[] }
        Returns: {
          alert_type: string
          location_district: string
          map_id: string
          thread_id: string
        }[]
      }
      get_social_feed_hydration: {
        Args: { p_thread_ids: string[] }
        Returns: {
          alert_district: string
          alert_type: string
          author_avatar_url: string
          author_display_name: string
          author_is_verified: boolean
          author_location_country: string
          author_social_id: string
          author_verification_status: string
          comments: Json
          has_alert_link: boolean
          is_sensitive: boolean
          map_id: string
          provider_video_id: string
          reply_mentions: Json
          share_count: number
          thread_id: string
          thread_mentions: Json
          video_duration_seconds: number
          video_embed_url: string
          video_playback_url: string
          video_preview_url: string
          video_provider: string
          video_status: string
          video_thumbnail_url: string
        }[]
      }
      get_users_with_active_restriction: {
        Args: { p_restriction_key: string; p_user_ids: string[] }
        Returns: {
          user_id: string
        }[]
      }
      get_visible_broadcast_alerts: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: {
          alert_type: string
          created_at: string
          creator_avatar_url: string
          creator_display_name: string
          creator_id: string
          creator_social_id: string
          description: string
          duration_hours: number
          expires_at: string
          id: string
          is_sensitive: boolean
          latitude: number
          location_district: string
          location_street: string
          longitude: number
          marker_state: string
          media_urls: string[]
          photo_url: string
          post_on_social: boolean
          posted_to_threads: boolean
          range_km: number
          range_meters: number
          report_count: number
          social_post_id: string
          social_status: string
          social_url: string
          support_count: number
          thread_id: string
          title: string
        }[]
      }
      get_visible_map_alerts: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          alert_type: string
          created_at: string
          creator_avatar_url: string
          creator_display_name: string
          creator_id: string
          description: string
          expires_at: string
          id: string
          latitude: number
          longitude: number
          photo_url: string
          posted_to_threads: boolean
          range_meters: number
          report_count: number
          social_status: string
          social_url: string
          support_count: number
          thread_id: string
          title: string
        }[]
      }
      get_visible_map_pin_shells: {
        Args: { p_lat: number; p_lng: number; p_radius_m?: number }
        Returns: {
          alert_type: string
          avatar_url: string
          display_name: string
          gender_genre: string
          is_alert: boolean
          is_invisible: boolean
          is_verified: boolean
          lat: number
          lng: number
          marker_state: string
          pin_id: string
          pin_type: string
          updated_at: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      handle_identity_review: {
        Args: { p_action: string; p_notes: string; p_target_user_id: string }
        Returns: undefined
      }
      handle_marketplace_payment_success: {
        Args: { p_payment_intent_id: string }
        Returns: undefined
      }
      has_native_reciprocal_wave: {
        Args: { p_target_user_id: string }
        Returns: boolean
      }
      hash_identifier: { Args: { input_value: string }; Returns: string }
      increment_pet_care_profile_view_count: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      increment_user_credits: {
        Args: {
          p_family_slots?: number
          p_media_credits?: number
          p_mesh_alerts?: number
          p_stars?: number
          p_user_id: string
        }
        Returns: undefined
      }
      invite_native_group_members: {
        Args: {
          p_chat_id: string
          p_chat_name: string
          p_invitee_user_ids: string[]
        }
        Returns: boolean
      }
      is_chat_member: {
        Args: { p_chat_id: string; p_user_id: string }
        Returns: boolean
      }
      is_huddle_admin_allowlisted_email: {
        Args: { p_email: string }
        Returns: boolean
      }
      is_in_scope: {
        Args: { p_target: string; p_viewer: string }
        Returns: boolean
      }
      is_native_group_admin: {
        Args: { p_chat_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_same_country_or_within_distance: {
        Args: { p_radius_m?: number; p_target: string; p_viewer: string }
        Returns: boolean
      }
      is_social_id_taken: { Args: { p_social_id: string }; Returns: boolean }
      is_user_blocked: { Args: { p_a: string; p_b: string }; Returns: boolean }
      is_user_restriction_active: {
        Args: { p_at?: string; p_restriction_key: string; p_user_id: string }
        Returns: boolean
      }
      join_native_group_member: {
        Args: { p_chat_id: string; p_role?: string; p_user_id?: string }
        Returns: boolean
      }
      join_private_group_by_code: {
        Args: { p_code: string }
        Returns: {
          chat_id: string
          chat_name: string
          joined: boolean
          reason: string
          room_code: string
        }[]
      }
      leave_native_family: { Args: never; Returns: Json }
      log_phone_otp_attempt: {
        Args: {
          p_attempt_type: string
          p_device_id?: string
          p_error?: string
          p_flags?: string[]
          p_ip: string
          p_phone_hash: string
          p_reason?: string
          p_session_id?: string
          p_status: string
          p_user_id?: string
        }
        Returns: number
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      lookup_signup_blocks: {
        Args: {
          p_device_id?: string
          p_email?: string
          p_install_id?: string
          p_phone?: string
        }
        Returns: Json
      }
      mark_booking_completed: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      mark_native_discover_match_seen: {
        Args: { p_matched_user_id: string }
        Returns: boolean
      }
      mark_room_read: {
        Args: {
          p_chat_id: string
          p_visible_before?: string
          p_visible_message_id?: string
        }
        Returns: {
          chat_id: string
          id: string
          message_id: string
          read_at: string
          user_id: string
        }[]
      }
      mark_service_finished: { Args: { p_chat_id: string }; Returns: undefined }
      native_map_actor_name: {
        Args: { p_user_id: string }
        Returns: {
          display_name: string
        }[]
      }
      native_map_alert_support_count: {
        Args: { p_alert_id: string }
        Returns: number
      }
      native_map_alert_supported: {
        Args: { p_alert_id: string }
        Returns: boolean
      }
      native_map_remove_alert_interaction: {
        Args: { p_alert_id: string; p_interaction_type: string }
        Returns: boolean
      }
      native_map_set_invisible: {
        Args: { p_invisible: boolean }
        Returns: boolean
      }
      native_map_upsert_alert_interaction: {
        Args: { p_alert_id: string; p_interaction_type: string }
        Returns: boolean
      }
      next_ticket_number: { Args: never; Returns: string }
      normalize_country_key: { Args: { p_value: string }; Returns: string }
      normalize_email_for_ban: {
        Args: { input_email: string }
        Returns: string
      }
      normalize_legal_name_for_identity: {
        Args: { input_value: string }
        Returns: string
      }
      normalize_phone_for_ban: {
        Args: { input_phone: string }
        Returns: string
      }
      notify_group_join: {
        Args: { p_chat_id: string; p_user_id: string }
        Returns: undefined
      }
      pii_purge_identity_verification: { Args: never; Returns: undefined }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      post_group_welcome_message: {
        Args: { p_chat_id: string; p_user_id: string }
        Returns: undefined
      }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      process_due_broadcast_alert_notifications: {
        Args: { p_limit?: number }
        Returns: number
      }
      process_due_map_alert_notifications: {
        Args: { p_limit?: number }
        Returns: number
      }
      process_identity_cleanup: { Args: never; Returns: undefined }
      process_notification_windows: { Args: never; Returns: number }
      process_pet_birthdays: { Args: never; Returns: number }
      process_pet_reminders: { Args: never; Returns: number }
      process_service_booking_reminders: { Args: never; Returns: number }
      process_service_payout_releases: { Args: never; Returns: number }
      process_storage_cleanup_queue: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          error_message: string
          id: string
          object_path: string
          processed: boolean
        }[]
      }
      process_subscription_expiring: { Args: never; Returns: number }
      process_user_report:
        | {
            Args: {
              p_attachment_urls?: string[]
              p_categories: string[]
              p_details?: string
              p_target_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_attachment_urls?: string[]
              p_categories: string[]
              p_details?: string
              p_source?: string
              p_target_id: string
            }
            Returns: Json
          }
      process_verification_nudges: { Args: never; Returns: number }
      purge_expired_cache: { Args: never; Returns: number }
      purge_expired_verification_docs: { Args: never; Returns: undefined }
      purge_service_analytics: {
        Args: { retention_days?: number }
        Returns: number
      }
      qms_reset_daily: { Args: never; Returns: undefined }
      qms_reset_monthly: { Args: never; Returns: undefined }
      qms_reset_weekly: { Args: never; Returns: undefined }
      qms_rollover_all: { Args: never; Returns: undefined }
      record_native_service_analytics: {
        Args: { p_event: string; p_payload?: Json }
        Returns: boolean
      }
      record_native_service_provider_view: {
        Args: { p_provider_user_id: string }
        Returns: boolean
      }
      record_social_feed_event: {
        Args: {
          p_event_type: string
          p_metadata?: Json
          p_session_id?: string
          p_thread_id: string
        }
        Returns: boolean
      }
      record_thread_share_click: {
        Args: { p_thread_id: string }
        Returns: number
      }
      refill_ai_vet_rate_limits: { Args: never; Returns: undefined }
      refresh_identity_verification_status: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["verification_status_enum"]
      }
      refresh_phone_verification_status: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["verification_status_enum"]
      }
      refresh_service_chat_status: {
        Args: { p_chat_id: string }
        Returns: string
      }
      refresh_subscription_quotas: { Args: never; Returns: undefined }
      register_native_media_asset: {
        Args: {
          p_bucket: string
          p_content_id?: string
          p_content_type?: string
          p_expires_at?: string
          p_object_path: string
        }
        Returns: string
      }
      release_escrow_funds: { Args: never; Returns: undefined }
      remove_group_chat: { Args: { p_chat_id: string }; Returns: undefined }
      remove_group_member: {
        Args: { p_chat_id: string; p_user_id: string }
        Returns: undefined
      }
      remove_native_family_member: {
        Args: { p_family_member_id: string }
        Returns: Json
      }
      remove_native_group_member: {
        Args: { p_chat_id: string; p_user_id?: string }
        Returns: boolean
      }
      replace_native_social_post_mentions: {
        Args: { p_mentions?: Json; p_post_id: string }
        Returns: boolean
      }
      replace_native_social_reply_mentions: {
        Args: { p_mentions?: Json; p_reply_id: string }
        Returns: boolean
      }
      report_category_weight: { Args: { category: string }; Returns: number }
      request_native_group_join: {
        Args: { p_chat_id: string }
        Returns: boolean
      }
      request_storage_cleanup: {
        Args: { p_bucket: string; p_object_path: string; p_reason: string }
        Returns: boolean
      }
      resolve_alert_notification_district:
        | {
            Args: { p_location_district: string; p_location_name: string }
            Returns: string
          }
        | {
            Args: {
              p_address: string
              p_location_district: string
              p_location_name: string
            }
            Returns: string
          }
      resolve_chat_report_freeze: {
        Args: {
          p_freeze_id: string
          p_keep_message_ids?: string[]
          p_valid: boolean
        }
        Returns: boolean
      }
      resolve_group_country_for_chat: {
        Args: {
          p_created_by: string
          p_location_country: string
          p_location_label: string
        }
        Returns: string
      }
      resolve_group_country_for_user: {
        Args: { p_user_id: string }
        Returns: string
      }
      resolve_native_social_mentions: {
        Args: { p_social_ids: string[] }
        Returns: {
          id: string
          social_id: string
        }[]
      }
      resolve_reliable_country_key_for_user: {
        Args: { p_user_id: string }
        Returns: string
      }
      search_chat_inbox: {
        Args: { p_query: string }
        Returns: {
          activity_ts: string
          avatar_url: string
          blocked_by_me: boolean
          blocked_by_them: boolean
          chat_id: string
          chat_name: string
          created_at: string
          created_by: string
          description: string
          join_method: string
          last_message_at: string
          last_message_content: string
          last_message_id: string
          last_message_read_by_other: boolean
          last_message_sender_id: string
          last_message_sender_name: string
          location_country: string
          location_label: string
          matched_at: string
          member_count: number
          peer_availability_label: string
          peer_avatar_url: string
          peer_has_car: boolean
          peer_is_verified: boolean
          peer_name: string
          peer_social_id: string
          peer_user_id: string
          pet_focus: string[]
          room_code: string
          room_type: string
          service_provider_id: string
          service_provider_skills: string[]
          service_request_card: Json
          service_requester_id: string
          service_status: string
          shape_issue: string
          unmatched_by_me: boolean
          unmatched_by_them: boolean
          unread_count: number
          visibility: string
        }[]
      }
      search_native_family_invite_candidates: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      search_native_social_mentions: {
        Args: { p_exclude_user_id?: string; p_limit?: number; p_query?: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          social_id: string
        }[]
      }
      send_discovery_wave: {
        Args: { p_target_user_id: string }
        Returns: {
          match_created: boolean
          mutual: boolean
          status: string
        }[]
      }
      send_match_first_message: {
        Args: {
          p_body?: string
          p_target_name?: string
          p_target_user_id: string
        }
        Returns: string
      }
      send_native_chat_message: {
        Args: { p_chat_id: string; p_content: string }
        Returns: {
          chat_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }[]
      }
      send_native_family_invite_notification: {
        Args: { p_family_member_id: string; p_invitee_user_id: string }
        Returns: boolean
      }
      send_native_social_share_to_chat: {
        Args: { p_chat_id: string; p_content: string }
        Returns: boolean
      }
      send_service_quote: {
        Args: { p_chat_id: string; p_quote_card: Json }
        Returns: undefined
      }
      send_service_request: {
        Args: { p_chat_id: string; p_request_card: Json }
        Returns: undefined
      }
      send_star_chat_atomic: {
        Args: {
          p_content?: string
          p_target_name?: string
          p_target_user_id: string
        }
        Returns: string
      }
      service_chat_has_valid_checkin: {
        Args: { p_service_chat_id: string }
        Returns: boolean
      }
      service_chat_scheduled_end_at: {
        Args: { p_service_chat_id: string }
        Returns: string
      }
      service_notify: {
        Args: {
          p_body: string
          p_data?: Json
          p_href: string
          p_kind: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      set_group_mute_state: {
        Args: { p_chat_id: string; p_muted: boolean }
        Returns: boolean
      }
      set_native_social_comment_support: {
        Args: { p_comment_id: string; p_supported: boolean }
        Returns: {
          support_count: number
          supported: boolean
        }[]
      }
      set_native_social_post_pinned: {
        Args: { p_pinned: boolean; p_thread_id: string }
        Returns: {
          is_pinned: boolean
          pinned_at: string
          thread_id: string
        }[]
      }
      set_native_social_post_saved: {
        Args: { p_saved: boolean; p_thread_id: string }
        Returns: boolean
      }
      set_native_social_support: {
        Args: { p_supported_before?: boolean; p_thread_id: string }
        Returns: number
      }
      set_user_location: {
        Args: {
          p_address?: string
          p_lat: number
          p_lng: number
          p_pin_hours?: number
          p_retention_hours?: number
        }
        Returns: undefined
      }
      share_service_start_pin: {
        Args: { p_chat_id: string; p_requester_confirmed: boolean }
        Returns: Json
      }
      social_discovery: {
        Args: {
          p_active_only?: boolean
          p_advanced?: boolean
          p_gender?: string
          p_height_max?: number
          p_height_min?: number
          p_lat: number
          p_lng: number
          p_max_age: number
          p_min_age: number
          p_only_waved?: boolean
          p_pet_size?: string
          p_radius_m: number
          p_role?: string
          p_species?: string[]
          p_user_id: string
        }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          dob: string
          gender_genre: string
          has_car: boolean
          height: number
          id: string
          is_verified: boolean
          location_name: string
          major: string
          occupation: string
          orientation: string
          pet_size: string
          pet_species: string[]
          pets: Json
          relationship_status: string
          school: string
          score: number
          show_academic: boolean
          show_age: boolean
          show_bio: boolean
          show_gender: boolean
          show_height: boolean
          show_occupation: boolean
          show_orientation: boolean
          show_relationship_status: boolean
          show_weight: boolean
          social_album: string[]
          social_role: string
          tier: string
          weight: number
          weight_unit: string
        }[]
      }
      social_discovery_legacy: {
        Args: {
          p_lat: number
          p_lng: number
          p_max_age: number
          p_min_age: number
          p_radius_m: number
          p_user_id: string
        }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          has_car: boolean
          id: string
          is_verified: boolean
          last_lat: number
          last_lng: number
        }[]
      }
      social_discovery_restricted: {
        Args: {
          p_active_only?: boolean
          p_advanced?: boolean
          p_gender?: string
          p_height_max?: number
          p_height_min?: number
          p_lat: number
          p_lng: number
          p_max_age: number
          p_min_age: number
          p_only_waved?: boolean
          p_pet_size?: string
          p_radius_m: number
          p_role?: string
          p_species?: string[]
          p_user_id: string
        }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          dob: string
          gender_genre: string
          has_car: boolean
          height: number
          id: string
          is_verified: boolean
          location_name: string
          major: string
          occupation: string
          orientation: string
          pet_size: string
          pet_species: string[]
          pets: Json
          relationship_status: string
          school: string
          score: number
          show_academic: boolean
          show_age: boolean
          show_bio: boolean
          show_gender: boolean
          show_height: boolean
          show_occupation: boolean
          show_orientation: boolean
          show_relationship_status: boolean
          show_weight: boolean
          social_album: string[]
          social_role: string
          tier: string
          weight: number
          weight_unit: string
        }[]
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      start_service: { Args: { p_chat_id: string }; Returns: undefined }
      start_service_now: { Args: { p_chat_id: string }; Returns: undefined }
      submit_handoff_problem: {
        Args: {
          p_chat_id: string
          p_evidence_urls?: string[]
          p_note: string
          p_reason: string
        }
        Returns: Json
      }
      submit_professional_credential: {
        Args: {
          p_country_region: string
          p_credential_type: string
          p_document_storage_path?: string
          p_expiry_date?: string
          p_issuing_body?: string
          p_legal_name: string
          p_license_number?: string
          p_provider_profile_id?: string
        }
        Returns: Json
      }
      submit_provider_completion: {
        Args: {
          p_chat_id: string
          p_confirmed_completed: boolean
          p_no_unresolved_safety_concerns: boolean
          p_note?: string
          p_photo_url?: string
          p_understands_review: boolean
        }
        Returns: Json
      }
      submit_requester_completion: {
        Args: {
          p_chat_id: string
          p_confirmed_completed: boolean
          p_note?: string
          p_understands_payout_review: boolean
        }
        Returns: Json
      }
      submit_requester_handoff_response: {
        Args: { p_chat_id: string; p_note: string }
        Returns: Json
      }
      submit_service_care_update: {
        Args: { p_chat_id: string; p_note?: string; p_photo_url?: string }
        Returns: Json
      }
      submit_service_checkin: {
        Args: {
          p_chat_id: string
          p_photo_url: string
          p_provider_confirmed: boolean
          p_start_pin: string
        }
        Returns: Json
      }
      submit_service_issue_report: {
        Args: {
          p_acknowledged_review: boolean
          p_chat_id: string
          p_evidence_urls?: string[]
          p_note: string
          p_reason: string
        }
        Returns: Json
      }
      submit_service_review: {
        Args: {
          p_chat_id: string
          p_rating: number
          p_review_text: string
          p_tags: string[]
        }
        Returns: undefined
      }
      submit_service_review_v2: {
        Args: {
          p_chat_id: string
          p_media_urls?: string[]
          p_rating: number
          p_review_text: string
          p_safety_incident_reported?: boolean
          p_tags: string[]
        }
        Returns: Json
      }
      sync_blocked_identity_verifications_for_user: {
        Args: { p_user_id: string }
        Returns: number
      }
      toggle_native_service_bookmark: {
        Args: { p_provider_user_id: string }
        Returns: boolean
      }
      touch_profile_activity: { Args: never; Returns: undefined }
      try_parse_numeric: { Args: { p_value: string }; Returns: number }
      unblock_user: { Args: { p_blocked_id: string }; Returns: undefined }
      unlockrows: { Args: { "": string }; Returns: number }
      unmatch_and_delete_direct_chat: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      unmatch_user_one_sided: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      update_broadcast_alert:
        | {
            Args: { p_alert_id: string; p_patch: Json }
            Returns: {
              address: string | null
              archived_at: string | null
              created_at: string
              creator_id: string
              description: string | null
              duration_hours: number
              expires_at: string | null
              geog: unknown
              id: string
              images: string[]
              incident_admin_area: string | null
              incident_city: string | null
              incident_country_code: string | null
              incident_country_name: string | null
              incident_district: string | null
              incident_location_confidence: string | null
              incident_location_source: string | null
              is_sensitive: boolean
              latitude: number
              longitude: number
              photo_url: string | null
              post_on_threads: boolean
              range_km: number
              range_meters: number | null
              thread_id: string | null
              title: string | null
              type: string
            }
            SetofOptions: {
              from: "*"
              to: "broadcast_alerts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_actor_id: string
              p_alert_id: string
              p_description: string
              p_title: string
            }
            Returns: {
              address: string | null
              archived_at: string | null
              created_at: string
              creator_id: string
              description: string | null
              duration_hours: number
              expires_at: string | null
              geog: unknown
              id: string
              images: string[]
              incident_admin_area: string | null
              incident_city: string | null
              incident_country_code: string | null
              incident_country_name: string | null
              incident_district: string | null
              incident_location_confidence: string | null
              incident_location_source: string | null
              is_sensitive: boolean
              latitude: number
              longitude: number
              photo_url: string | null
              post_on_threads: boolean
              range_km: number
              range_meters: number | null
              thread_id: string | null
              title: string | null
              type: string
            }
            SetofOptions: {
              from: "*"
              to: "broadcast_alerts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      update_group_chat_metadata:
        | {
            Args: {
              p_avatar_url?: string
              p_chat_id: string
              p_description?: string
              p_update_avatar?: boolean
              p_update_description?: boolean
            }
            Returns: {
              avatar_url: string
              created_at: string
              created_by: string
              description: string
              id: string
              join_method: string
              last_message_at: string
              location_country: string
              location_label: string
              member_count: number
              name: string
              pet_focus: string[]
              room_code: string
              visibility: string
            }[]
          }
        | {
            Args: {
              p_avatar_url?: string
              p_chat_id: string
              p_description?: string
              p_location_label?: string
              p_name?: string
              p_pet_focus?: string[]
              p_update_avatar?: boolean
              p_update_description?: boolean
              p_update_location?: boolean
              p_update_name?: boolean
              p_update_pet_focus?: boolean
            }
            Returns: {
              avatar_url: string
              created_at: string
              created_by: string
              description: string
              id: string
              join_method: string
              last_message_at: string
              location_country: string
              location_label: string
              member_count: number
              name: string
              pet_focus: string[]
              room_code: string
              visibility: string
            }[]
          }
        | {
            Args: {
              p_avatar_url?: string
              p_chat_id: string
              p_description?: string
              p_name?: string
              p_update_avatar?: boolean
              p_update_description?: boolean
              p_update_name?: boolean
            }
            Returns: {
              avatar_url: string
              created_at: string
              created_by: string
              description: string
              id: string
              join_method: string
              last_message_at: string
              location_country: string
              location_label: string
              member_count: number
              name: string
              pet_focus: string[]
              room_code: string
              visibility: string
            }[]
          }
      update_native_chat_message_content: {
        Args: { p_content: string; p_message_id: string }
        Returns: {
          chat_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }[]
      }
      update_native_social_comment: {
        Args: { p_comment_id: string; p_content: string }
        Returns: boolean
      }
      update_native_social_thread: {
        Args: {
          p_category: string
          p_content: string
          p_images?: string[]
          p_is_sensitive?: boolean
          p_thread_id: string
          p_title: string
          p_video?: Json
        }
        Returns: string
      }
      update_threads_scores: { Args: never; Returns: undefined }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upgrade_user_tier: {
        Args: {
          p_stripe_subscription_id: string
          p_subscription_status: string
          p_tier: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_notification_window: {
        Args: {
          p_actor_id: string
          p_actor_name: string
          p_category: string
          p_href: string
          p_kind: string
          p_owner_user_id: string
          p_subject_id: string
          p_subject_type: string
        }
        Returns: boolean
      }
      upsert_notification_window_internal: {
        Args: {
          p_actor_id: string
          p_actor_name: string
          p_category: string
          p_href: string
          p_kind: string
          p_owner_user_id: string
          p_subject_id: string
          p_subject_type: string
        }
        Returns: undefined
      }
      validate_service_booking_snapshot: {
        Args: { p_snapshot: Json }
        Returns: undefined
      }
      validate_service_quote_payload: {
        Args: { p_quote_card: Json }
        Returns: undefined
      }
      validate_service_request_payload: {
        Args: { p_request_card: Json }
        Returns: undefined
      }
      withdraw_service_quote: {
        Args: { p_chat_id: string }
        Returns: undefined
      }
      withdraw_service_request: {
        Args: { p_chat_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_status_enum: "active" | "restricted" | "suspended" | "removed"
      credential_automation_level: "api" | "downloadable" | "web_lookup"
      credential_confidence: "none" | "low" | "medium" | "high"
      credential_source_type:
        | "official_registry"
        | "issuer_certificate"
        | "org_registry"
        | "licence_registry"
        | "directory"
      credential_verification_method:
        | "none"
        | "registry"
        | "certificate"
        | "organization"
        | "directory"
      professional_credential_status:
        | "self_declared"
        | "check_pending"
        | "registry_matched"
        | "certificate_matched"
        | "organization_matched"
        | "directory_matched"
        | "unable_to_verify"
      tier_enum: "free" | "plus" | "gold"
      verification_status_enum: "unverified" | "pending" | "verified"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status_enum: ["active", "restricted", "suspended", "removed"],
      credential_automation_level: ["api", "downloadable", "web_lookup"],
      credential_confidence: ["none", "low", "medium", "high"],
      credential_source_type: [
        "official_registry",
        "issuer_certificate",
        "org_registry",
        "licence_registry",
        "directory",
      ],
      credential_verification_method: [
        "none",
        "registry",
        "certificate",
        "organization",
        "directory",
      ],
      professional_credential_status: [
        "self_declared",
        "check_pending",
        "registry_matched",
        "certificate_matched",
        "organization_matched",
        "directory_matched",
        "unable_to_verify",
      ],
      tier_enum: ["free", "plus", "gold"],
      verification_status_enum: ["unverified", "pending", "verified"],
    },
  },
} as const
