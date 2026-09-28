export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      drivers: {
        Row: {
          active: boolean;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          phone: string | null;
          plate: string | null;
          user_id: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
          plate?: string | null;
          user_id?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
          plate?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          email_confirmed_at: string | null;
          full_name: string;
          id: string;
          role: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          email_confirmed_at?: string | null;
          full_name?: string;
          id: string;
          role?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          email_confirmed_at?: string | null;
          full_name?: string;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
      shifts: {
        Row: {
          created_at: string;
          created_by: string | null;
          driver_id: string;
          empty_km: number;
          expenses_vat: number | null;
          fuel: number;
          gross_receipts: number | null;
          id: string;
          month: number;
          net_cash: number | null;
          net_revenue: number;
          other_expenses: number;
          paid_km: number;
          repairs: number;
          tips: number;
          total_expenses: number | null;
          total_km: number | null;
          trips: number;
          updated_at: string;
          vat: number | null;
          vat_balance: number | null;
          year: number;
          z_number: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          driver_id: string;
          empty_km?: number;
          expenses_vat?: never;
          fuel?: number;
          gross_receipts?: never;
          id?: string;
          month: number;
          net_cash?: never;
          net_revenue?: number;
          other_expenses?: number;
          paid_km?: number;
          repairs?: number;
          tips?: number;
          total_expenses?: never;
          total_km?: never;
          trips?: number;
          updated_at?: string;
          vat?: never;
          vat_balance?: never;
          year: number;
          z_number: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          driver_id?: string;
          empty_km?: number;
          expenses_vat?: never;
          fuel?: number;
          gross_receipts?: never;
          id?: string;
          month?: number;
          net_cash?: never;
          net_revenue?: number;
          other_expenses?: number;
          paid_km?: number;
          repairs?: number;
          tips?: number;
          total_expenses?: never;
          total_km?: never;
          trips?: number;
          updated_at?: string;
          vat?: never;
          vat_balance?: never;
          year?: number;
          z_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shifts_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicle_expenses: {
        Row: {
          amount: number;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string;
          driver_id: string;
          id: string;
          month: number;
          updated_at: string;
          vat: number | null;
          year: number;
        };
        Insert: {
          amount: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          driver_id: string;
          id?: string;
          month: number;
          updated_at?: string;
          vat?: never;
          year: number;
        };
        Update: {
          amount?: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          driver_id?: string;
          id?: string;
          month?: number;
          updated_at?: string;
          vat?: never;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_expenses_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      monthly_summary: {
        Row: {
          driver_id: string | null;
          driver_name: string | null;
          empty_km: number | null;
          expenses_vat: number | null;
          fuel: number | null;
          gross_receipts: number | null;
          month: number | null;
          net_cash: number | null;
          net_revenue: number | null;
          other_expenses: number | null;
          paid_km: number | null;
          plate: string | null;
          repairs: number | null;
          revenue_per_km: number | null;
          shifts: number | null;
          tips: number | null;
          total_expenses: number | null;
          total_km: number | null;
          trips: number | null;
          utilization_pct: number | null;
          vat: number | null;
          vat_balance: number | null;
          vat_status: string | null;
          vehicle_expenses: number | null;
          year: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_exists: { Args: Record<PropertyKey, never>; Returns: boolean };
      claim_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
