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
      crm_activities: {
        Row: {
          body: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          id: string
          kind: Database["public"]["Enums"]["crm_activity_kind"]
          occurred_at: string
          org_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["crm_activity_kind"]
          occurred_at?: string
          org_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["crm_activity_kind"]
          occurred_at?: string
          org_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          archived: boolean
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          source: string | null
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          source?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          source?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          amount: number
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          org_id: string
          owner_user_id: string | null
          position: number
          probability: number
          stage: Database["public"]["Enums"]["crm_deal_stage"]
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          org_id: string
          owner_user_id?: string | null
          position?: number
          probability?: number
          stage?: Database["public"]["Enums"]["crm_deal_stage"]
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          org_id?: string
          owner_user_id?: string | null
          position?: number
          probability?: number
          stage?: Database["public"]["Enums"]["crm_deal_stage"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
          expense_category: string | null
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
          expense_category?: string | null
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
          expense_category?: string | null
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
          category: string | null
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
          category?: string | null
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
          category?: string | null
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
          expense_category: string | null
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
          expense_category?: string | null
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
          expense_category?: string | null
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
      ip_watchlist: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          ip_hash: string
          reason: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          ip_hash: string
          reason?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          ip_hash?: string
          reason?: string | null
        }
        Relationships: []
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
          business_type: string | null
          created_at: string
          created_by: string
          currency: string | null
          description: string | null
          goals: string | null
          id: string
          industry: string | null
          name: string
          onboarded_at: string | null
          slug: string | null
          team_size: string | null
          updated_at: string
        }
        Insert: {
          business_type?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          description?: string | null
          goals?: string | null
          id?: string
          industry?: string | null
          name: string
          onboarded_at?: string | null
          slug?: string | null
          team_size?: string | null
          updated_at?: string
        }
        Update: {
          business_type?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          description?: string | null
          goals?: string | null
          id?: string
          industry?: string | null
          name?: string
          onboarded_at?: string | null
          slug?: string | null
          team_size?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_org_id: string | null
          avatar_url: string | null
          blocked_at: string | null
          blocked_reason: string | null
          created_at: string
          full_name: string | null
          id: string
          is_blocked: boolean
          preferred_language: string
          preferred_mode: string
          updated_at: string
        }
        Insert: {
          active_org_id?: string | null
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_blocked?: boolean
          preferred_language?: string
          preferred_mode?: string
          updated_at?: string
        }
        Update: {
          active_org_id?: string | null
          avatar_url?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_blocked?: boolean
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
      project_members: {
        Row: {
          created_at: string
          hourly_rate: number | null
          id: string
          org_id: string
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          org_id: string
          project_id: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          org_id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget_amount: number | null
          client_name: string | null
          code: string | null
          color: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          org_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          budget_amount?: number | null
          client_name?: string | null
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          org_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          budget_amount?: number | null
          client_name?: string | null
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          org_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "sales_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          email: string | null
          error: string | null
          id: string
          message: string
          meta: Json
          org_id: string
          parent_reminder_id: string | null
          phone_e164: string | null
          provider: string
          provider_message_id: string | null
          recurrence: Database["public"]["Enums"]["reminder_recurrence"]
          recurrence_interval: number
          recurrence_until: string | null
          scheduled_at: string
          sent_at: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["reminder_source"]
          status: Database["public"]["Enums"]["reminder_status"]
          team_member_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel?: string
          created_at?: string
          email?: string | null
          error?: string | null
          id?: string
          message: string
          meta?: Json
          org_id: string
          parent_reminder_id?: string | null
          phone_e164?: string | null
          provider?: string
          provider_message_id?: string | null
          recurrence?: Database["public"]["Enums"]["reminder_recurrence"]
          recurrence_interval?: number
          recurrence_until?: string | null
          scheduled_at: string
          sent_at?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["reminder_source"]
          status?: Database["public"]["Enums"]["reminder_status"]
          team_member_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          email?: string | null
          error?: string | null
          id?: string
          message?: string
          meta?: Json
          org_id?: string
          parent_reminder_id?: string | null
          phone_e164?: string | null
          provider?: string
          provider_message_id?: string | null
          recurrence?: Database["public"]["Enums"]["reminder_recurrence"]
          recurrence_interval?: number
          recurrence_until?: string | null
          scheduled_at?: string
          sent_at?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["reminder_source"]
          status?: Database["public"]["Enums"]["reminder_status"]
          team_member_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_parent_reminder_id_fkey"
            columns: ["parent_reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      request_metrics: {
        Row: {
          country: string | null
          duration_ms: number
          email: string | null
          id: string
          ip_hash: string | null
          method: string
          occurred_at: string
          path: string
          status: number
          ua_hash: string | null
          user_id: string | null
        }
        Insert: {
          country?: string | null
          duration_ms?: number
          email?: string | null
          id?: string
          ip_hash?: string | null
          method?: string
          occurred_at?: string
          path: string
          status?: number
          ua_hash?: string | null
          user_id?: string | null
        }
        Update: {
          country?: string | null
          duration_ms?: number
          email?: string | null
          id?: string
          ip_hash?: string | null
          method?: string
          occurred_at?: string
          path?: string
          status?: number
          ua_hash?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sales_customers: {
        Row: {
          address: string | null
          archived: boolean
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived?: boolean
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived?: boolean
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          org_id: string
          position: number
          product_id: string | null
          quantity: number
          subtotal: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          org_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          subtotal?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          org_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          subtotal?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          customer_id: string | null
          customer_name_snapshot: string | null
          due_date: string | null
          id: string
          issue_date: string
          issued_at: string | null
          notes: string | null
          number: number | null
          org_id: string
          paid_amount: number
          status: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          customer_id?: string | null
          customer_name_snapshot?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string
          issued_at?: string | null
          notes?: string | null
          number?: number | null
          org_id: string
          paid_amount?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string | null
          customer_name_snapshot?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string
          issued_at?: string | null
          notes?: string | null
          number?: number | null
          org_id?: string
          paid_amount?: number
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "sales_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          created_by: string
          finance_transaction_id: string | null
          id: string
          invoice_id: string
          method: string
          notes: string | null
          org_id: string
          paid_on: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          created_by: string
          finance_transaction_id?: string | null
          id?: string
          invoice_id: string
          method?: string
          notes?: string | null
          org_id: string
          paid_on?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string
          finance_transaction_id?: string | null
          id?: string
          invoice_id?: string
          method?: string
          notes?: string | null
          org_id?: string
          paid_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_payments_finance_transaction_id_fkey"
            columns: ["finance_transaction_id"]
            isOneToOne: false
            referencedRelation: "finance_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_batches: {
        Row: {
          affected: Json
          created_at: string
          currency: string | null
          id: string
          item_count: number
          kind: string
          org_id: string
          payload: Json | null
          source_name: string | null
          summary: string | null
          total: number | null
          undone_at: string | null
          user_id: string
        }
        Insert: {
          affected?: Json
          created_at?: string
          currency?: string | null
          id?: string
          item_count?: number
          kind: string
          org_id: string
          payload?: Json | null
          source_name?: string | null
          summary?: string | null
          total?: number | null
          undone_at?: string | null
          user_id: string
        }
        Update: {
          affected?: Json
          created_at?: string
          currency?: string | null
          id?: string
          item_count?: number
          kind?: string
          org_id?: string
          payload?: Json | null
          source_name?: string | null
          summary?: string | null
          total?: number | null
          undone_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          email: string | null
          event_type: string
          id: string
          message: string | null
          meta: Json
          occurred_at: string
          org_id: string | null
          path: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_type: string
          id?: string
          message?: string | null
          meta?: Json
          occurred_at?: string
          org_id?: string | null
          path?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event_type?: string
          id?: string
          message?: string | null
          meta?: Json
          occurred_at?: string
          org_id?: string | null
          path?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_events_org_id_fkey"
            columns: ["org_id"]
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          archived: boolean
          code: string
          created_at: string
          created_by: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          org_id: string
          phone_e164: string | null
          position: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          code: string
          created_at?: string
          created_by: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          org_id: string
          phone_e164?: string | null
          position?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          code?: string
          created_at?: string
          created_by?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          org_id?: string
          phone_e164?: string | null
          position?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_org_id_fkey"
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
      time_entries: {
        Row: {
          billable: boolean
          created_at: string
          entry_date: string
          hours: number
          id: string
          note: string | null
          org_id: string
          project_id: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          created_at?: string
          entry_date?: string
          hours: number
          id?: string
          note?: string | null
          org_id: string
          project_id: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billable?: boolean
          created_at?: string
          entry_date?: string
          hours?: number
          id?: string
          note?: string | null
          org_id?: string
          project_id?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_settings: {
        Row: {
          created_at: string
          default_lead_minutes: number
          enabled: boolean
          phone_e164: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_lead_minutes?: number
          enabled?: boolean
          phone_e164?: string | null
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_lead_minutes?: number
          enabled?: boolean
          phone_e164?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { _token: string }; Returns: string }
      am_i_blocked: { Args: never; Returns: boolean }
      can_write_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      detect_and_log_suspicious: { Args: never; Returns: undefined }
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
      is_platform_owner: { Args: { _user_id: string }; Returns: boolean }
      log_security_event: {
        Args: {
          _email?: string
          _event_type: string
          _message?: string
          _meta?: Json
          _path?: string
          _severity?: string
        }
        Returns: string
      }
      lookup_invite: {
        Args: { _token: string }
        Returns: {
          accepted_at: string
          expires_at: string
          invited_email: string
          org_id: string
          org_name: string
          revoked_at: string
          role: Database["public"]["Enums"]["org_role"]
        }[]
      }
      next_invoice_number: { Args: { _org_id: string }; Returns: number }
      platform_add_watch: {
        Args: { _ip_hash: string; _reason?: string }
        Returns: undefined
      }
      platform_list_users: {
        Args: never
        Returns: {
          blocked_at: string
          blocked_reason: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          last_sign_in_at: string
          org_count: number
        }[]
      }
      platform_remove_watch: { Args: { _ip_hash: string }; Returns: undefined }
      platform_set_blocked: {
        Args: { _blocked: boolean; _reason: string; _user_id: string }
        Returns: undefined
      }
      platform_suspicious: {
        Args: { _hours?: number }
        Returns: {
          detail: Json
          kind: string
          score: number
          subject: string
        }[]
      }
      platform_top_ips: {
        Args: { _hours?: number; _limit?: number }
        Returns: {
          errors: number
          ip_hash: string
          last_seen: string
          requests: number
          unique_users: number
          watched: boolean
        }[]
      }
      platform_top_users: {
        Args: { _hours?: number; _limit?: number }
        Returns: {
          avg_ms: number
          email: string
          errors: number
          last_seen: string
          requests: number
          user_id: string
        }[]
      }
      platform_traffic_series: {
        Args: { _hours?: number }
        Returns: {
          bucket: string
          errors: number
          requests: number
        }[]
      }
      platform_traffic_summary: { Args: { _hours?: number }; Returns: Json }
      purge_old_request_metrics: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "user" | "admin_manager" | "platform_owner"
      crm_activity_kind: "note" | "call" | "email" | "meeting" | "task"
      crm_deal_stage:
        | "lead"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
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
      project_member_role: "lead" | "member" | "viewer"
      project_status: "active" | "paused" | "completed" | "cancelled"
      reminder_recurrence: "none" | "daily" | "weekly" | "monthly"
      reminder_source: "task" | "habit" | "event" | "custom"
      reminder_status: "pending" | "sent" | "failed" | "cancelled"
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
      app_role: ["user", "admin_manager", "platform_owner"],
      crm_activity_kind: ["note", "call", "email", "meeting", "task"],
      crm_deal_stage: [
        "lead",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
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
      project_member_role: ["lead", "member", "viewer"],
      project_status: ["active", "paused", "completed", "cancelled"],
      reminder_recurrence: ["none", "daily", "weekly", "monthly"],
      reminder_source: ["task", "habit", "event", "custom"],
      reminder_status: ["pending", "sent", "failed", "cancelled"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "doing", "done", "archived"],
    },
  },
} as const
