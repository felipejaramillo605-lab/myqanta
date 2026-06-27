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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      events: {
        Row: {
          all_day: boolean
          color: string | null
          created_at: string
          description: string | null
          ends_at: string
          id: string
          location: string | null
          org_id: string
          starts_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          location?: string | null
          org_id: string
          starts_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          location?: string | null
          org_id?: string
          starts_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_accounts: {
        Row: {
          created_at: string
          currency: string
          id: string
          kind: string
          name: string
          opening_balance: number
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          name: string
          opening_balance?: number
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          name?: string
          opening_balance?: number
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_statements: {
        Row: {
          account_id: string | null
          ai_summary: string | null
          created_at: string
          id: string
          org_id: string
          period_end: string | null
          period_start: string | null
          raw_text: string | null
          source_name: string
          status: string
          transactions_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          ai_summary?: string | null
          created_at?: string
          id?: string
          org_id: string
          period_end?: string | null
          period_start?: string | null
          raw_text?: string | null
          source_name: string
          status?: string
          transactions_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          ai_summary?: string | null
          created_at?: string
          id?: string
          org_id?: string
          period_end?: string | null
          period_start?: string | null
          raw_text?: string | null
          source_name?: string
          status?: string
          transactions_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_statements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_statements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_transactions: {
        Row: {
          account_id: string | null
          ai_confidence: number | null
          amount: number
          bucket: Database["public"]["Enums"]["finance_bucket"]
          created_at: string
          currency: string
          description: string
          id: string
          occurred_on: string
          org_id: string
          source: string
          statement_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          ai_confidence?: number | null
          amount: number
          bucket: Database["public"]["Enums"]["finance_bucket"]
          created_at?: string
          currency?: string
          description: string
          id?: string
          occurred_on: string
          org_id: string
          source?: string
          statement_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          ai_confidence?: number | null
          amount?: number
          bucket?: Database["public"]["Enums"]["finance_bucket"]
          created_at?: string
          currency?: string
          description?: string
          id?: string
          occurred_on?: string
          org_id?: string
          source?: string
          statement_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "finance_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          count: number
          created_at: string
          habit_id: string
          id: string
          logged_on: string
          note: string | null
          org_id: string
          user_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          habit_id: string
          id?: string
          logged_on?: string
          note?: string | null
          org_id: string
          user_id: string
        }
        Update: {
          count?: number
          created_at?: string
          habit_id?: string
          id?: string
          logged_on?: string
          note?: string | null
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          archived: boolean
          cadence: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          target_per_period: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          cadence?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          target_per_period?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          cadence?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          target_per_period?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_invoices: {
        Row: {
          created_at: string
          currency: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          org_id: string
          party_id: string | null
          raw_ai_json: Json | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          org_id: string
          party_id?: string | null
          raw_ai_json?: Json | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          org_id?: string
          party_id?: string | null
          raw_ai_json?: Json | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_invoices_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "inv_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_movements: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["inv_movement_kind"]
          notes: string | null
          occurred_at: string
          org_id: string
          party_id: string | null
          product_id: string
          quantity: number
          source_invoice_id: string | null
          total: number
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["inv_movement_kind"]
          notes?: string | null
          occurred_at?: string
          org_id: string
          party_id?: string | null
          product_id: string
          quantity: number
          source_invoice_id?: string | null
          total?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["inv_movement_kind"]
          notes?: string | null
          occurred_at?: string
          org_id?: string
          party_id?: string | null
          product_id?: string
          quantity?: number
          source_invoice_id?: string | null
          total?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_movements_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "inv_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_parties: {
        Row: {
          created_at: string
          email: string | null
          id: string
          kind: Database["public"]["Enums"]["inv_party_kind"]
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          tax_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["inv_party_kind"]
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["inv_party_kind"]
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_parties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_products: {
        Row: {
          category: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          min_stock: number
          name: string
          org_id: string
          price: number
          sku: string | null
          stock: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          min_stock?: number
          name: string
          org_id: string
          price?: number
          sku?: string | null
          stock?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          min_stock?: number
          name?: string
          org_id?: string
          price?: number
          sku?: string | null
          stock?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string | null
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_email?: string | null
          org_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string | null
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_org_id: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          preferred_language: string
          preferred_mode: string
          updated_at: string
        }
        Insert: {
          active_org_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          preferred_language?: string
          preferred_mode?: string
          updated_at?: string
        }
        Update: {
          active_org_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          preferred_language?: string
          preferred_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_settings: {
        Row: {
          accent_color: string
          background_dark: string
          background_light: string
          created_at: string
          default_mode: string
          destructive_color: string
          font_mono: string
          font_sans: string
          foreground_dark: string
          foreground_light: string
          id: string
          is_active: boolean
          positive_color: string
          primary_color: string
          radius_rem: number
          secondary_color: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accent_color?: string
          background_dark?: string
          background_light?: string
          created_at?: string
          default_mode?: string
          destructive_color?: string
          font_mono?: string
          font_sans?: string
          foreground_dark?: string
          foreground_light?: string
          id?: string
          is_active?: boolean
          positive_color?: string
          primary_color?: string
          radius_rem?: number
          secondary_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent_color?: string
          background_dark?: string
          background_light?: string
          created_at?: string
          default_mode?: string
          destructive_color?: string
          font_mono?: string
          font_sans?: string
          foreground_dark?: string
          foreground_light?: string
          id?: string
          is_active?: boolean
          positive_color?: string
          primary_color?: string
          radius_rem?: number
          secondary_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      get_active_org: { Args: { _user_id: string }; Returns: string }
      has_org_role: {
        Args: {
          _min_role: Database["public"]["Enums"]["org_role"]
          _org_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "admin_manager"
      finance_bucket:
        | "revenue"
        | "cogs"
        | "opex"
        | "depreciation"
        | "amortization"
        | "interest"
        | "tax"
        | "other_income"
        | "other_expense"
      inv_movement_kind: "purchase" | "sale" | "adjustment" | "transfer"
      inv_party_kind: "supplier" | "customer"
      org_role: "owner" | "admin" | "member" | "viewer"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "doing" | "done" | "archived"
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
    Enums: {
      app_role: ["user", "admin_manager"],
      finance_bucket: [
        "revenue",
        "cogs",
        "opex",
        "depreciation",
        "amortization",
        "interest",
        "tax",
        "other_income",
        "other_expense",
      ],
      inv_movement_kind: ["purchase", "sale", "adjustment", "transfer"],
      inv_party_kind: ["supplier", "customer"],
      org_role: ["owner", "admin", "member", "viewer"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "doing", "done", "archived"],
    },
  },
} as const
