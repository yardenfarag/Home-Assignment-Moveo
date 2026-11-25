/**
 * @module core/db/database.types
 *
 * GENERATED from the live Supabase schema (Supabase "generate TypeScript types"),
 * trimmed to the `Database` type. Do not edit by hand — regenerate after each migration.
 */

/** Any JSON value stored in a jsonb column. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Typed description of every table, used to type the Supabase client. */
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      answer_cache: {
        Row: {
          answer: Json;
          cache_key: string;
          created_at: string;
          expires_at: string;
          id: string;
          messages: Json;
          model: string;
          question: string;
          scores_version: string;
          updated_at: string;
        };
        Insert: {
          answer: Json;
          cache_key: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          messages: Json;
          model: string;
          question: string;
          scores_version: string;
          updated_at?: string;
        };
        Update: {
          answer?: Json;
          cache_key?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          messages?: Json;
          model?: string;
          question?: string;
          scores_version?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          answer: Json | null;
          content: Json;
          created_at: string;
          id: string;
          model: string | null;
          role: string;
          session_id: string;
          updated_at: string;
        };
        Insert: {
          answer?: Json | null;
          content: Json;
          created_at?: string;
          id?: string;
          model?: string | null;
          role: string;
          session_id: string;
          updated_at?: string;
        };
        Update: {
          answer?: Json | null;
          content?: Json;
          created_at?: string;
          id?: string;
          model?: string | null;
          role?: string;
          session_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "chat_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_sessions: {
        Row: {
          created_at: string;
          id: string;
          last_message_at: string | null;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          correlation_id: string | null;
          created_at: string;
          event_type: string;
          hub_id: string | null;
          id: number;
          level: string;
          message: string | null;
          payload: Json;
          session_id: string | null;
          source: string;
          updated_at: string;
        };
        Insert: {
          correlation_id?: string | null;
          created_at?: string;
          event_type: string;
          hub_id?: string | null;
          id?: never;
          level?: string;
          message?: string | null;
          payload?: Json;
          session_id?: string | null;
          source: string;
          updated_at?: string;
        };
        Update: {
          correlation_id?: string | null;
          created_at?: string;
          event_type?: string;
          hub_id?: string | null;
          id?: never;
          level?: string;
          message?: string | null;
          payload?: Json;
          session_id?: string | null;
          source?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "chat_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      fema_nri: {
        Row: {
          cfld_afreq: number | null;
          county_area_sq_mi: number | null;
          county_fips: string;
          county_name: string;
          created_at: string;
          cwav_afreq: number | null;
          hail_afreq: number | null;
          hrcn_afreq: number | null;
          hub_id: string;
          hwav_afreq: number | null;
          ifld_afreq: number | null;
          istm_afreq: number | null;
          nri_version: string;
          raw_attributes: Json;
          swnd_afreq: number | null;
          trnd_afreq: number | null;
          updated_at: string;
          wntw_afreq: number | null;
        };
        Insert: {
          cfld_afreq?: number | null;
          county_area_sq_mi?: number | null;
          county_fips: string;
          county_name: string;
          created_at?: string;
          cwav_afreq?: number | null;
          hail_afreq?: number | null;
          hrcn_afreq?: number | null;
          hub_id: string;
          hwav_afreq?: number | null;
          ifld_afreq?: number | null;
          istm_afreq?: number | null;
          nri_version: string;
          raw_attributes?: Json;
          swnd_afreq?: number | null;
          trnd_afreq?: number | null;
          updated_at?: string;
          wntw_afreq?: number | null;
        };
        Update: {
          cfld_afreq?: number | null;
          county_area_sq_mi?: number | null;
          county_fips?: string;
          county_name?: string;
          created_at?: string;
          cwav_afreq?: number | null;
          hail_afreq?: number | null;
          hrcn_afreq?: number | null;
          hub_id?: string;
          hwav_afreq?: number | null;
          ifld_afreq?: number | null;
          istm_afreq?: number | null;
          nri_version?: string;
          raw_attributes?: Json;
          swnd_afreq?: number | null;
          trnd_afreq?: number | null;
          updated_at?: string;
          wntw_afreq?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fema_nri_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: true;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      hubs: {
        Row: {
          county_fips: string | null;
          county_name: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          latitude: number;
          longitude: number;
          name: string;
          region: string;
          state: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          county_fips?: string | null;
          county_name?: string | null;
          created_at?: string;
          id: string;
          is_active?: boolean;
          latitude: number;
          longitude: number;
          name: string;
          region: string;
          state: string;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          county_fips?: string | null;
          county_name?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          latitude?: number;
          longitude?: number;
          name?: string;
          region?: string;
          state?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      score_snapshots: {
        Row: {
          confidence: string;
          created_at: string;
          hazard_scores: Json;
          hub_id: string;
          id: string;
          overall_score: number;
          risk_level: string;
          run_id: string;
          scoring_version: string;
          top_hazard: string;
          updated_at: string;
          window_end: string;
          window_start: string;
        };
        Insert: {
          confidence: string;
          created_at?: string;
          hazard_scores: Json;
          hub_id: string;
          id?: string;
          overall_score: number;
          risk_level: string;
          run_id: string;
          scoring_version: string;
          top_hazard: string;
          updated_at?: string;
          window_end: string;
          window_start: string;
        };
        Update: {
          confidence?: string;
          created_at?: string;
          hazard_scores?: Json;
          hub_id?: string;
          id?: string;
          overall_score?: number;
          risk_level?: string;
          run_id?: string;
          scoring_version?: string;
          top_hazard?: string;
          updated_at?: string;
          window_end?: string;
          window_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "score_snapshots_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      weather_daily: {
        Row: {
          apparent_temp_max_c: number | null;
          created_at: string;
          date: string;
          hub_id: string;
          precipitation_mm: number | null;
          snowfall_cm: number | null;
          source: string;
          temp_min_c: number | null;
          updated_at: string;
          wind_gust_max_kmh: number | null;
        };
        Insert: {
          apparent_temp_max_c?: number | null;
          created_at?: string;
          date: string;
          hub_id: string;
          precipitation_mm?: number | null;
          snowfall_cm?: number | null;
          source?: string;
          temp_min_c?: number | null;
          updated_at?: string;
          wind_gust_max_kmh?: number | null;
        };
        Update: {
          apparent_temp_max_c?: number | null;
          created_at?: string;
          date?: string;
          hub_id?: string;
          precipitation_mm?: number | null;
          snowfall_cm?: number | null;
          source?: string;
          temp_min_c?: number | null;
          updated_at?: string;
          wind_gust_max_kmh?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "weather_daily_hub_id_fkey";
            columns: ["hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
