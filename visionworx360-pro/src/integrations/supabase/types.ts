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
      area_modification_factors_nce2026: {
        Row: {
          equipment_pct: number | null
          id: number
          is_state_average: boolean
          labor_pct: number | null
          location: string
          material_pct: number | null
          source_version: string | null
          total_weighted_avg_pct: number | null
          zip_high: number | null
          zip_low: number | null
          zip_prefix: string | null
        }
        Insert: {
          equipment_pct?: number | null
          id?: number
          is_state_average?: boolean
          labor_pct?: number | null
          location: string
          material_pct?: number | null
          source_version?: string | null
          total_weighted_avg_pct?: number | null
          zip_high?: number | null
          zip_low?: number | null
          zip_prefix?: string | null
        }
        Update: {
          equipment_pct?: number | null
          id?: number
          is_state_average?: boolean
          labor_pct?: number | null
          location?: string
          material_pct?: number | null
          source_version?: string | null
          total_weighted_avg_pct?: number | null
          zip_high?: number | null
          zip_low?: number | null
          zip_prefix?: string | null
        }
        Relationships: []
      }
      assembly_expansion_components: {
        Row: {
          created_at: string
          expansion_id: string
          id: string
          inclusion: string
          is_contractor_authored: boolean
          is_included: boolean
          name: string
          organization_id: string
          quantity: number | null
          quantity_basis: string
          reason: string | null
          search_terms: string[]
          selected_at: string | null
          selected_by: string | null
          selected_reference_id: number | null
          sequence: number
          typical_unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expansion_id: string
          id?: string
          inclusion?: string
          is_contractor_authored?: boolean
          is_included?: boolean
          name: string
          organization_id: string
          quantity?: number | null
          quantity_basis?: string
          reason?: string | null
          search_terms?: string[]
          selected_at?: string | null
          selected_by?: string | null
          selected_reference_id?: number | null
          sequence: number
          typical_unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expansion_id?: string
          id?: string
          inclusion?: string
          is_contractor_authored?: boolean
          is_included?: boolean
          name?: string
          organization_id?: string
          quantity?: number | null
          quantity_basis?: string
          reason?: string | null
          search_terms?: string[]
          selected_at?: string | null
          selected_by?: string | null
          selected_reference_id?: number | null
          sequence?: number
          typical_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_expansion_components_expansion_id_fkey"
            columns: ["expansion_id"]
            isOneToOne: false
            referencedRelation: "assembly_expansions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_expansion_components_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_expansions: {
        Row: {
          assembly_label: string
          context: Json
          created_at: string
          created_by: string | null
          id: string
          is_contractor_edited: boolean
          model: string
          organization_id: string
          prompt_version: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          scope_phrase: string
          signature: string
          trade_key: string
          updated_at: string
        }
        Insert: {
          assembly_label: string
          context?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_contractor_edited?: boolean
          model: string
          organization_id: string
          prompt_version: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope_phrase: string
          signature: string
          trade_key: string
          updated_at?: string
        }
        Update: {
          assembly_label?: string
          context?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_contractor_edited?: boolean
          model?: string
          organization_id?: string
          prompt_version?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope_phrase?: string
          signature?: string
          trade_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_expansions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_favorites: {
        Row: {
          assembly_key: string
          created_at: string
          id: string
          is_pinned: boolean
          organization_id: string
          user_id: string
        }
        Insert: {
          assembly_key: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          organization_id: string
          user_id?: string
        }
        Update: {
          assembly_key?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_favorites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_template_items: {
        Row: {
          assembly_key: string
          created_at: string
          id: string
          notes: string | null
          organization_id: string | null
          quantity: number | null
          section_label: string
          sort_order: number
          template_id: string
          unit_key: Database["public"]["Enums"]["scope_unit"] | null
        }
        Insert: {
          assembly_key: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          quantity?: number | null
          section_label?: string
          sort_order?: number
          template_id: string
          unit_key?: Database["public"]["Enums"]["scope_unit"] | null
        }
        Update: {
          assembly_key?: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          quantity?: number | null
          section_label?: string
          sort_order?: number
          template_id?: string
          unit_key?: Database["public"]["Enums"]["scope_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "assembly_template_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "assembly_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_templates: {
        Row: {
          archived_at: string | null
          category_key: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system_template: boolean
          library_version: number | null
          name: string
          organization_id: string | null
          template_key: string
          trade_key: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          library_version?: number | null
          name: string
          organization_id?: string | null
          template_key: string
          trade_key?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          library_version?: number | null
          name?: string
          organization_id?: string | null
          template_key?: string
          trade_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_usage: {
        Row: {
          assembly_key: string
          id: string
          last_used_at: string
          organization_id: string
          use_count: number
          user_id: string
        }
        Insert: {
          assembly_key: string
          id?: string
          last_used_at?: string
          organization_id: string
          use_count?: number
          user_id?: string
        }
        Update: {
          assembly_key?: string
          id?: string
          last_used_at?: string
          organization_id?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_assemblies: {
        Row: {
          assembly_key: string
          ballpark_allowance_eligible: boolean
          category_key: string
          client_description: string | null
          code_reference: string | null
          cost_basis: Database["public"]["Enums"]["task_cost_basis"] | null
          craft_code: string | null
          created_at: string
          crew_size: number | null
          default_labor_hours: number | null
          default_overhead_pct: number | null
          default_scope_description: string
          equipment_requirements: string | null
          estimated_duration_hours: number | null
          finish_tier_applies: boolean
          geometry_basis: string | null
          id: string
          inspection_notes: string | null
          internal_notes: string | null
          is_active: boolean
          is_composite: boolean
          is_sample_data: boolean
          keywords: string[]
          library_version: number
          material_allowance: number | null
          material_cost_high: number | null
          material_cost_low: number | null
          measurement_method: string | null
          production_rate: number | null
          productivity_convention: string | null
          safety_notes: string | null
          search_vector: unknown
          setup_hours: number
          skill_level: string | null
          sort_order: number
          source_version: string | null
          subcategory_key: string | null
          suggested_markup_pct: number | null
          suggested_profit_pct: number | null
          synonyms: string[]
          trade_key: string
          typical_dependencies: string[]
          unit_key: Database["public"]["Enums"]["scope_unit"]
          updated_at: string
          waste_factor: number | null
          work_item: string
        }
        Insert: {
          assembly_key: string
          ballpark_allowance_eligible?: boolean
          category_key: string
          client_description?: string | null
          code_reference?: string | null
          cost_basis?: Database["public"]["Enums"]["task_cost_basis"] | null
          craft_code?: string | null
          created_at?: string
          crew_size?: number | null
          default_labor_hours?: number | null
          default_overhead_pct?: number | null
          default_scope_description: string
          equipment_requirements?: string | null
          estimated_duration_hours?: number | null
          finish_tier_applies?: boolean
          geometry_basis?: string | null
          id?: string
          inspection_notes?: string | null
          internal_notes?: string | null
          is_active?: boolean
          is_composite?: boolean
          is_sample_data?: boolean
          keywords?: string[]
          library_version: number
          material_allowance?: number | null
          material_cost_high?: number | null
          material_cost_low?: number | null
          measurement_method?: string | null
          production_rate?: number | null
          productivity_convention?: string | null
          safety_notes?: string | null
          search_vector?: unknown
          setup_hours?: number
          skill_level?: string | null
          sort_order?: number
          source_version?: string | null
          subcategory_key?: string | null
          suggested_markup_pct?: number | null
          suggested_profit_pct?: number | null
          synonyms?: string[]
          trade_key: string
          typical_dependencies?: string[]
          unit_key: Database["public"]["Enums"]["scope_unit"]
          updated_at?: string
          waste_factor?: number | null
          work_item: string
        }
        Update: {
          assembly_key?: string
          ballpark_allowance_eligible?: boolean
          category_key?: string
          client_description?: string | null
          code_reference?: string | null
          cost_basis?: Database["public"]["Enums"]["task_cost_basis"] | null
          craft_code?: string | null
          created_at?: string
          crew_size?: number | null
          default_labor_hours?: number | null
          default_overhead_pct?: number | null
          default_scope_description?: string
          equipment_requirements?: string | null
          estimated_duration_hours?: number | null
          finish_tier_applies?: boolean
          geometry_basis?: string | null
          id?: string
          inspection_notes?: string | null
          internal_notes?: string | null
          is_active?: boolean
          is_composite?: boolean
          is_sample_data?: boolean
          keywords?: string[]
          library_version?: number
          material_allowance?: number | null
          material_cost_high?: number | null
          material_cost_low?: number | null
          measurement_method?: string | null
          production_rate?: number | null
          productivity_convention?: string | null
          safety_notes?: string | null
          search_vector?: unknown
          setup_hours?: number
          skill_level?: string | null
          sort_order?: number
          source_version?: string | null
          subcategory_key?: string | null
          suggested_markup_pct?: number | null
          suggested_profit_pct?: number | null
          synonyms?: string[]
          trade_key?: string
          typical_dependencies?: string[]
          unit_key?: Database["public"]["Enums"]["scope_unit"]
          updated_at?: string
          waste_factor?: number | null
          work_item?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_assemblies_library_version_fkey"
            columns: ["library_version"]
            isOneToOne: false
            referencedRelation: "catalog_library_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      catalog_intent_aliases: {
        Row: {
          alias_norm: string
          assembly_key: string | null
          created_at: string
          id: string
          library_version: number
          match_kind: string
          note: string | null
          priority: number
          quantity_factor: number
          review_reason: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          alias_norm: string
          assembly_key?: string | null
          created_at?: string
          id?: string
          library_version: number
          match_kind: string
          note?: string | null
          priority?: number
          quantity_factor?: number
          review_reason?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          alias_norm?: string
          assembly_key?: string | null
          created_at?: string
          id?: string
          library_version?: number
          match_kind?: string
          note?: string | null
          priority?: number
          quantity_factor?: number
          review_reason?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_intent_aliases_library_version_fkey"
            columns: ["library_version"]
            isOneToOne: false
            referencedRelation: "catalog_library_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      catalog_library_versions: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          name: string
          notes: string | null
          released_at: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          name: string
          notes?: string | null
          released_at?: string
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          name?: string
          notes?: string | null
          released_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          address_line1: string | null
          city: string | null
          company: string | null
          created_at: string
          created_by: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          postal_code: string | null
          preferred_contact: Database["public"]["Enums"]["contact_method"]
          region: string | null
          secondary_phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          postal_code?: string | null
          preferred_contact?: Database["public"]["Enums"]["contact_method"]
          region?: string | null
          secondary_phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postal_code?: string | null
          preferred_contact?: Database["public"]["Enums"]["contact_method"]
          region?: string | null
          secondary_phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_terminology_corrections: {
        Row: {
          applied_count: number
          capture_method: string
          context_scope: string
          corrected_term: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_applied_at: string | null
          organization_id: string
          source_evidence: string | null
          source_project_id: string | null
          trade_key: string | null
          trigger_phrase: string | null
          trigger_phrase_norm: string | null
          updated_at: string
          wrong_term: string
          wrong_term_norm: string | null
        }
        Insert: {
          applied_count?: number
          capture_method?: string
          context_scope?: string
          corrected_term: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_applied_at?: string | null
          organization_id: string
          source_evidence?: string | null
          source_project_id?: string | null
          trade_key?: string | null
          trigger_phrase?: string | null
          trigger_phrase_norm?: string | null
          updated_at?: string
          wrong_term: string
          wrong_term_norm?: string | null
        }
        Update: {
          applied_count?: number
          capture_method?: string
          context_scope?: string
          corrected_term?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_applied_at?: string | null
          organization_id?: string
          source_evidence?: string | null
          source_project_id?: string | null
          trade_key?: string | null
          trigger_phrase?: string | null
          trigger_phrase_norm?: string | null
          updated_at?: string
          wrong_term?: string
          wrong_term_norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_terminology_corrections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_terminology_corrections_source_project_id_fkey"
            columns: ["source_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_reference_nce2026: {
        Row: {
          craft_hours: string | null
          created_at: string | null
          description: string
          equipment: number | null
          id: number
          labor: number | null
          material: number | null
          section: string | null
          source_version: string | null
          total: number | null
          unit: string | null
        }
        Insert: {
          craft_hours?: string | null
          created_at?: string | null
          description: string
          equipment?: number | null
          id?: number
          labor?: number | null
          material?: number | null
          section?: string | null
          source_version?: string | null
          total?: number | null
          unit?: string | null
        }
        Update: {
          craft_hours?: string | null
          created_at?: string | null
          description?: string
          equipment?: number | null
          id?: number
          labor?: number | null
          material?: number | null
          section?: string | null
          source_version?: string | null
          total?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      estimate_audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          estimate_id: string
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          project_id: string
          summary: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          estimate_id: string
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          project_id: string
          summary?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          estimate_id?: string
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          project_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_audit_events_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_ballpark_sessions: {
        Row: {
          answers: Json
          assumed_values: Json
          completed_payload: Json | null
          confidence: string | null
          confirmed_values: Json
          contractor_overrides: Json
          created_at: string
          created_by: string
          current_question_id: string | null
          current_stage: string
          derived_geometry: Json
          derived_quantities: Json
          draft_preview: Json | null
          estimate_id: string
          frozen_question_ids: Json
          id: string
          inferred_values: Json
          intake_source: string
          interview_type: string
          organization_id: string
          payload: Json
          photo_analysis: Json
          photo_references: Json
          project_id: string
          range_inputs: Json
          range_snapshot: Json | null
          schema_key: string
          schema_version: number
          transcripts: Json
          unknowns: Json
          updated_at: string
        }
        Insert: {
          answers?: Json
          assumed_values?: Json
          completed_payload?: Json | null
          confidence?: string | null
          confirmed_values?: Json
          contractor_overrides?: Json
          created_at?: string
          created_by?: string
          current_question_id?: string | null
          current_stage: string
          derived_geometry?: Json
          derived_quantities?: Json
          draft_preview?: Json | null
          estimate_id: string
          frozen_question_ids?: Json
          id?: string
          inferred_values?: Json
          intake_source: string
          interview_type?: string
          organization_id: string
          payload?: Json
          photo_analysis?: Json
          photo_references?: Json
          project_id: string
          range_inputs?: Json
          range_snapshot?: Json | null
          schema_key: string
          schema_version?: number
          transcripts?: Json
          unknowns?: Json
          updated_at?: string
        }
        Update: {
          answers?: Json
          assumed_values?: Json
          completed_payload?: Json | null
          confidence?: string | null
          confirmed_values?: Json
          contractor_overrides?: Json
          created_at?: string
          created_by?: string
          current_question_id?: string | null
          current_stage?: string
          derived_geometry?: Json
          derived_quantities?: Json
          draft_preview?: Json | null
          estimate_id?: string
          frozen_question_ids?: Json
          id?: string
          inferred_values?: Json
          intake_source?: string
          interview_type?: string
          organization_id?: string
          payload?: Json
          photo_analysis?: Json
          photo_references?: Json
          project_id?: string
          range_inputs?: Json
          range_snapshot?: Json | null
          schema_key?: string
          schema_version?: number
          transcripts?: Json
          unknowns?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_ballpark_sessions_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: true
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_ballpark_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_ballpark_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_items: {
        Row: {
          archived_at: string | null
          assembly_component_id: string | null
          assembly_component_quantities: Json | null
          assembly_expansion_id: string | null
          assembly_expansion_status: string | null
          assembly_geometry: Json | null
          catalog_confirmed_at: string | null
          catalog_confirmed_by: string | null
          catalog_item_key: string | null
          catalog_mapping_source: string | null
          category_key: string | null
          contingency_pct: number
          cost_basis: Database["public"]["Enums"]["task_cost_basis"] | null
          cost_basis_repaired_at: string | null
          cost_basis_source: string | null
          cost_book_applied_at: string | null
          created_at: string
          created_by: string
          description: string
          direct_cost: number | null
          equipment_cost: number
          equipment_total: number | null
          estimate_id: string
          group_label: string | null
          id: string
          internal_notes: string | null
          is_client_visible: boolean
          is_price_overridden: boolean
          is_quantity_placeholder: boolean
          is_taxable: boolean
          labor_convention: string | null
          labor_hours: number
          labor_hours_basis: string | null
          labor_hours_confirmed_at: string | null
          labor_hours_confirmed_by: string | null
          labor_hours_flag: string | null
          labor_hours_formula: string | null
          labor_hours_per_unit: number | null
          labor_hours_previous: number | null
          labor_hours_repaired_at: string | null
          labor_hours_setup: number
          labor_rate: number
          labor_total: number | null
          material_cost: number
          material_total: number | null
          organization_id: string
          origin_at: string
          origin_ref: string | null
          origin_type: string
          other_cost: number
          other_total: number | null
          overhead_pct: number
          parent_line_id: string | null
          priced_at: string | null
          pricing_basis: Json | null
          pricing_provenance: Json
          pricing_source: string | null
          profit_pct: number
          project_id: string
          quantity: number
          quantity_basis: string | null
          quantity_basis_formula: Json
          quantity_basis_note: string | null
          quantity_is_assumed_default: boolean
          quantity_reviewed_at: string | null
          quantity_reviewed_by: string | null
          quantity_source_measurement_id: string | null
          rate_override_at: string | null
          rate_override_by: string | null
          rate_override_equipment_cost: number | null
          rate_override_hours_per_unit: number | null
          rate_override_labor_rate: number | null
          rate_override_material_unit_cost: number | null
          rate_override_note: string | null
          rate_override_other_cost: number | null
          rate_override_setup_hours: number | null
          resolution_status: Database["public"]["Enums"]["line_resolution_status"]
          room_id: string | null
          scope_item_id: string | null
          scope_section_id: string | null
          sort_order: number
          subcategory_key: string | null
          subcontractor_cost: number
          subcontractor_total: number | null
          trade_key: string | null
          trade_source: string | null
          unit_key: Database["public"]["Enums"]["scope_unit"] | null
          unresolved_reason: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assembly_component_id?: string | null
          assembly_component_quantities?: Json | null
          assembly_expansion_id?: string | null
          assembly_expansion_status?: string | null
          assembly_geometry?: Json | null
          catalog_confirmed_at?: string | null
          catalog_confirmed_by?: string | null
          catalog_item_key?: string | null
          catalog_mapping_source?: string | null
          category_key?: string | null
          contingency_pct?: number
          cost_basis?: Database["public"]["Enums"]["task_cost_basis"] | null
          cost_basis_repaired_at?: string | null
          cost_basis_source?: string | null
          cost_book_applied_at?: string | null
          created_at?: string
          created_by: string
          description?: string
          direct_cost?: number | null
          equipment_cost?: number
          equipment_total?: number | null
          estimate_id: string
          group_label?: string | null
          id?: string
          internal_notes?: string | null
          is_client_visible?: boolean
          is_price_overridden?: boolean
          is_quantity_placeholder?: boolean
          is_taxable?: boolean
          labor_convention?: string | null
          labor_hours?: number
          labor_hours_basis?: string | null
          labor_hours_confirmed_at?: string | null
          labor_hours_confirmed_by?: string | null
          labor_hours_flag?: string | null
          labor_hours_formula?: string | null
          labor_hours_per_unit?: number | null
          labor_hours_previous?: number | null
          labor_hours_repaired_at?: string | null
          labor_hours_setup?: number
          labor_rate?: number
          labor_total?: number | null
          material_cost?: number
          material_total?: number | null
          organization_id: string
          origin_at?: string
          origin_ref?: string | null
          origin_type?: string
          other_cost?: number
          other_total?: number | null
          overhead_pct?: number
          parent_line_id?: string | null
          priced_at?: string | null
          pricing_basis?: Json | null
          pricing_provenance?: Json
          pricing_source?: string | null
          profit_pct?: number
          project_id: string
          quantity?: number
          quantity_basis?: string | null
          quantity_basis_formula?: Json
          quantity_basis_note?: string | null
          quantity_is_assumed_default?: boolean
          quantity_reviewed_at?: string | null
          quantity_reviewed_by?: string | null
          quantity_source_measurement_id?: string | null
          rate_override_at?: string | null
          rate_override_by?: string | null
          rate_override_equipment_cost?: number | null
          rate_override_hours_per_unit?: number | null
          rate_override_labor_rate?: number | null
          rate_override_material_unit_cost?: number | null
          rate_override_note?: string | null
          rate_override_other_cost?: number | null
          rate_override_setup_hours?: number | null
          resolution_status?: Database["public"]["Enums"]["line_resolution_status"]
          room_id?: string | null
          scope_item_id?: string | null
          scope_section_id?: string | null
          sort_order?: number
          subcategory_key?: string | null
          subcontractor_cost?: number
          subcontractor_total?: number | null
          trade_key?: string | null
          trade_source?: string | null
          unit_key?: Database["public"]["Enums"]["scope_unit"] | null
          unresolved_reason?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assembly_component_id?: string | null
          assembly_component_quantities?: Json | null
          assembly_expansion_id?: string | null
          assembly_expansion_status?: string | null
          assembly_geometry?: Json | null
          catalog_confirmed_at?: string | null
          catalog_confirmed_by?: string | null
          catalog_item_key?: string | null
          catalog_mapping_source?: string | null
          category_key?: string | null
          contingency_pct?: number
          cost_basis?: Database["public"]["Enums"]["task_cost_basis"] | null
          cost_basis_repaired_at?: string | null
          cost_basis_source?: string | null
          cost_book_applied_at?: string | null
          created_at?: string
          created_by?: string
          description?: string
          direct_cost?: number | null
          equipment_cost?: number
          equipment_total?: number | null
          estimate_id?: string
          group_label?: string | null
          id?: string
          internal_notes?: string | null
          is_client_visible?: boolean
          is_price_overridden?: boolean
          is_quantity_placeholder?: boolean
          is_taxable?: boolean
          labor_convention?: string | null
          labor_hours?: number
          labor_hours_basis?: string | null
          labor_hours_confirmed_at?: string | null
          labor_hours_confirmed_by?: string | null
          labor_hours_flag?: string | null
          labor_hours_formula?: string | null
          labor_hours_per_unit?: number | null
          labor_hours_previous?: number | null
          labor_hours_repaired_at?: string | null
          labor_hours_setup?: number
          labor_rate?: number
          labor_total?: number | null
          material_cost?: number
          material_total?: number | null
          organization_id?: string
          origin_at?: string
          origin_ref?: string | null
          origin_type?: string
          other_cost?: number
          other_total?: number | null
          overhead_pct?: number
          parent_line_id?: string | null
          priced_at?: string | null
          pricing_basis?: Json | null
          pricing_provenance?: Json
          pricing_source?: string | null
          profit_pct?: number
          project_id?: string
          quantity?: number
          quantity_basis?: string | null
          quantity_basis_formula?: Json
          quantity_basis_note?: string | null
          quantity_is_assumed_default?: boolean
          quantity_reviewed_at?: string | null
          quantity_reviewed_by?: string | null
          quantity_source_measurement_id?: string | null
          rate_override_at?: string | null
          rate_override_by?: string | null
          rate_override_equipment_cost?: number | null
          rate_override_hours_per_unit?: number | null
          rate_override_labor_rate?: number | null
          rate_override_material_unit_cost?: number | null
          rate_override_note?: string | null
          rate_override_other_cost?: number | null
          rate_override_setup_hours?: number | null
          resolution_status?: Database["public"]["Enums"]["line_resolution_status"]
          room_id?: string | null
          scope_item_id?: string | null
          scope_section_id?: string | null
          sort_order?: number
          subcategory_key?: string | null
          subcontractor_cost?: number
          subcontractor_total?: number | null
          trade_key?: string | null
          trade_source?: string | null
          unit_key?: Database["public"]["Enums"]["scope_unit"] | null
          unresolved_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_assembly_component_id_fkey"
            columns: ["assembly_component_id"]
            isOneToOne: false
            referencedRelation: "assembly_expansion_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_assembly_expansion_id_fkey"
            columns: ["assembly_expansion_id"]
            isOneToOne: false
            referencedRelation: "assembly_expansions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_parent_line_id_fkey"
            columns: ["parent_line_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_scope_item_id_fkey"
            columns: ["scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_scope_section_id_fkey"
            columns: ["scope_section_id"]
            isOneToOne: false
            referencedRelation: "scope_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_repair_runs: {
        Row: {
          contractor_preserved: number
          created_at: string
          estimate_id: string
          id: string
          organization_id: string
          repaired: number
          unresolved: number
        }
        Insert: {
          contractor_preserved?: number
          created_at?: string
          estimate_id: string
          id?: string
          organization_id: string
          repaired?: number
          unresolved?: number
        }
        Update: {
          contractor_preserved?: number
          created_at?: string
          estimate_id?: string
          id?: string
          organization_id?: string
          repaired?: number
          unresolved?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_repair_runs_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          accepted_at: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          copied_from_estimate_id: string | null
          copied_from_label: string | null
          copied_from_project_id: string | null
          copied_source_dated_at: string | null
          cost_catalog_ref: string | null
          created_at: string
          created_by: string
          currency: string
          declined_at: string | null
          default_contingency_pct: number
          default_labor_rate: number
          default_overhead_pct: number
          default_profit_pct: number
          document_kind: string
          id: string
          intake_mode: string
          labor_settings: Json
          lineage_root_id: string | null
          locked_at: string | null
          notes: string | null
          option_label: string | null
          organization_id: string
          parent_estimate_id: string | null
          pricing_confirmation_reason: string | null
          pricing_confirmation_required: boolean
          pricing_confirmed_at: string | null
          pricing_copy_mode: string | null
          pricing_engine_version: number
          pricing_location: string | null
          pricing_location_factors: Json | null
          pricing_location_override: string | null
          pricing_location_source: string | null
          pricing_method: string
          pricing_mode: string
          pricing_repriced_at: string | null
          pricing_settings_locked_at: string | null
          pricing_source: string | null
          project_id: string
          range_assumptions: Json
          range_snapshot: Json | null
          reconciliation_snapshot: Json | null
          revision_number: number
          scope_sync_fingerprint: string | null
          scope_synced_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["estimate_status"]
          superseded_by_id: string | null
          target_gross_margin_pct: number
          tax_rate: number
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          copied_from_estimate_id?: string | null
          copied_from_label?: string | null
          copied_from_project_id?: string | null
          copied_source_dated_at?: string | null
          cost_catalog_ref?: string | null
          created_at?: string
          created_by: string
          currency?: string
          declined_at?: string | null
          default_contingency_pct?: number
          default_labor_rate?: number
          default_overhead_pct?: number
          default_profit_pct?: number
          document_kind?: string
          id?: string
          intake_mode?: string
          labor_settings?: Json
          lineage_root_id?: string | null
          locked_at?: string | null
          notes?: string | null
          option_label?: string | null
          organization_id: string
          parent_estimate_id?: string | null
          pricing_confirmation_reason?: string | null
          pricing_confirmation_required?: boolean
          pricing_confirmed_at?: string | null
          pricing_copy_mode?: string | null
          pricing_engine_version?: number
          pricing_location?: string | null
          pricing_location_factors?: Json | null
          pricing_location_override?: string | null
          pricing_location_source?: string | null
          pricing_method?: string
          pricing_mode?: string
          pricing_repriced_at?: string | null
          pricing_settings_locked_at?: string | null
          pricing_source?: string | null
          project_id: string
          range_assumptions?: Json
          range_snapshot?: Json | null
          reconciliation_snapshot?: Json | null
          revision_number?: number
          scope_sync_fingerprint?: string | null
          scope_synced_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          superseded_by_id?: string | null
          target_gross_margin_pct?: number
          tax_rate?: number
          title?: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          copied_from_estimate_id?: string | null
          copied_from_label?: string | null
          copied_from_project_id?: string | null
          copied_source_dated_at?: string | null
          cost_catalog_ref?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          declined_at?: string | null
          default_contingency_pct?: number
          default_labor_rate?: number
          default_overhead_pct?: number
          default_profit_pct?: number
          document_kind?: string
          id?: string
          intake_mode?: string
          labor_settings?: Json
          lineage_root_id?: string | null
          locked_at?: string | null
          notes?: string | null
          option_label?: string | null
          organization_id?: string
          parent_estimate_id?: string | null
          pricing_confirmation_reason?: string | null
          pricing_confirmation_required?: boolean
          pricing_confirmed_at?: string | null
          pricing_copy_mode?: string | null
          pricing_engine_version?: number
          pricing_location?: string | null
          pricing_location_factors?: Json | null
          pricing_location_override?: string | null
          pricing_location_source?: string | null
          pricing_method?: string
          pricing_mode?: string
          pricing_repriced_at?: string | null
          pricing_settings_locked_at?: string | null
          pricing_source?: string | null
          project_id?: string
          range_assumptions?: Json
          range_snapshot?: Json | null
          reconciliation_snapshot?: Json | null
          revision_number?: number
          scope_sync_fingerprint?: string | null
          scope_synced_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          superseded_by_id?: string | null
          target_gross_margin_pct?: number
          tax_rate?: number
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimates_copied_from_estimate_id_fkey"
            columns: ["copied_from_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_copied_from_project_id_fkey"
            columns: ["copied_from_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_lineage_root_id_fkey"
            columns: ["lineage_root_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_parent_estimate_id_fkey"
            columns: ["parent_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_wage_rates_nce2026: {
        Row: {
          base_wage_per_hour: number | null
          craft: string
          id: number
          insurance_and_taxes_dollars: number | null
          insurance_and_taxes_pct: number | null
          nontaxable_fringe_benefits: number | null
          source_version: string | null
          taxable_fringe_benefits: number | null
          total_hourly_cost: number | null
        }
        Insert: {
          base_wage_per_hour?: number | null
          craft: string
          id?: number
          insurance_and_taxes_dollars?: number | null
          insurance_and_taxes_pct?: number | null
          nontaxable_fringe_benefits?: number | null
          source_version?: string | null
          taxable_fringe_benefits?: number | null
          total_hourly_cost?: number | null
        }
        Update: {
          base_wage_per_hour?: number | null
          craft?: string
          id?: number
          insurance_and_taxes_dollars?: number | null
          insurance_and_taxes_pct?: number | null
          nontaxable_fringe_benefits?: number | null
          source_version?: string | null
          taxable_fringe_benefits?: number | null
          total_hourly_cost?: number | null
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          document_key: string
          document_version: string
          id: string
          locale: string | null
          organization_id: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          document_key: string
          document_version: string
          id?: string
          locale?: string | null
          organization_id?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          document_key?: string
          document_version?: string
          id?: string
          locale?: string | null
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      material_pricing_providers: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          is_enabled: boolean
          last_verified_at: string | null
          last_verify_error: string | null
          last_verify_status: string | null
          organization_id: string
          provider_type: Database["public"]["Enums"]["material_pricing_provider_type"]
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_verified_at?: string | null
          last_verify_error?: string | null
          last_verify_status?: string | null
          organization_id: string
          provider_type: Database["public"]["Enums"]["material_pricing_provider_type"]
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_verified_at?: string | null
          last_verify_error?: string | null
          last_verify_status?: string | null
          organization_id?: string
          provider_type?: Database["public"]["Enums"]["material_pricing_provider_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_pricing_providers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nce_craft_codes: {
        Row: {
          code: string
          craft: string
          created_at: string
          is_assumed: boolean
          note: string | null
          source_version: string
          updated_at: string
        }
        Insert: {
          code: string
          craft: string
          created_at?: string
          is_assumed?: boolean
          note?: string | null
          source_version?: string
          updated_at?: string
        }
        Update: {
          code?: string
          craft?: string
          created_at?: string
          is_assumed?: boolean
          note?: string | null
          source_version?: string
          updated_at?: string
        }
        Relationships: []
      }
      nce_section_map: {
        Row: {
          category_key: string | null
          created_at: string
          id: string
          notes: string | null
          section_pattern: string
          trade_key: string
          updated_at: string
        }
        Insert: {
          category_key?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          section_pattern: string
          trade_key: string
          updated_at?: string
        }
        Update: {
          category_key?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          section_pattern?: string
          trade_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string
          id: string
          link_url: string | null
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          id?: string
          link_url?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          id?: string
          link_url?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      org_assemblies: {
        Row: {
          archived_at: string | null
          assembly_key: string
          category_key: string
          client_description: string | null
          code_reference: string | null
          cost_basis: Database["public"]["Enums"]["task_cost_basis"] | null
          created_at: string
          created_by: string
          crew_size: number | null
          default_labor_hours: number | null
          default_overhead_pct: number | null
          default_scope_description: string
          equipment_requirements: string | null
          estimated_duration_hours: number | null
          id: string
          inspection_notes: string | null
          internal_notes: string | null
          is_disabled: boolean
          keywords: string[]
          material_allowance: number | null
          measurement_method: string | null
          organization_id: string
          production_rate: number | null
          productivity_convention: string | null
          safety_notes: string | null
          setup_hours: number
          skill_level: string | null
          source_assembly_key: string | null
          source_library_version: number | null
          subcategory_key: string | null
          suggested_markup_pct: number | null
          suggested_profit_pct: number | null
          synonyms: string[]
          trade_key: string
          typical_dependencies: string[]
          unit_key: Database["public"]["Enums"]["scope_unit"]
          updated_at: string
          waste_factor: number | null
          work_item: string
        }
        Insert: {
          archived_at?: string | null
          assembly_key: string
          category_key: string
          client_description?: string | null
          code_reference?: string | null
          cost_basis?: Database["public"]["Enums"]["task_cost_basis"] | null
          created_at?: string
          created_by?: string
          crew_size?: number | null
          default_labor_hours?: number | null
          default_overhead_pct?: number | null
          default_scope_description: string
          equipment_requirements?: string | null
          estimated_duration_hours?: number | null
          id?: string
          inspection_notes?: string | null
          internal_notes?: string | null
          is_disabled?: boolean
          keywords?: string[]
          material_allowance?: number | null
          measurement_method?: string | null
          organization_id: string
          production_rate?: number | null
          productivity_convention?: string | null
          safety_notes?: string | null
          setup_hours?: number
          skill_level?: string | null
          source_assembly_key?: string | null
          source_library_version?: number | null
          subcategory_key?: string | null
          suggested_markup_pct?: number | null
          suggested_profit_pct?: number | null
          synonyms?: string[]
          trade_key: string
          typical_dependencies?: string[]
          unit_key: Database["public"]["Enums"]["scope_unit"]
          updated_at?: string
          waste_factor?: number | null
          work_item: string
        }
        Update: {
          archived_at?: string | null
          assembly_key?: string
          category_key?: string
          client_description?: string | null
          code_reference?: string | null
          cost_basis?: Database["public"]["Enums"]["task_cost_basis"] | null
          created_at?: string
          created_by?: string
          crew_size?: number | null
          default_labor_hours?: number | null
          default_overhead_pct?: number | null
          default_scope_description?: string
          equipment_requirements?: string | null
          estimated_duration_hours?: number | null
          id?: string
          inspection_notes?: string | null
          internal_notes?: string | null
          is_disabled?: boolean
          keywords?: string[]
          material_allowance?: number | null
          measurement_method?: string | null
          organization_id?: string
          production_rate?: number | null
          productivity_convention?: string | null
          safety_notes?: string | null
          setup_hours?: number
          skill_level?: string | null
          source_assembly_key?: string | null
          source_library_version?: number | null
          subcategory_key?: string | null
          suggested_markup_pct?: number | null
          suggested_profit_pct?: number | null
          synonyms?: string[]
          trade_key?: string
          typical_dependencies?: string[]
          unit_key?: Database["public"]["Enums"]["scope_unit"]
          updated_at?: string
          waste_factor?: number | null
          work_item?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_assemblies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_assembly_override_history: {
        Row: {
          action: string
          assembly_key: string
          changed_by: string | null
          created_at: string
          id: string
          new_values: Json | null
          organization_id: string
          previous_values: Json | null
        }
        Insert: {
          action: string
          assembly_key: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          organization_id: string
          previous_values?: Json | null
        }
        Update: {
          action?: string
          assembly_key?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          organization_id?: string
          previous_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "org_assembly_override_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_assembly_overrides: {
        Row: {
          archived_at: string | null
          assembly_key: string
          client_description: string | null
          code_reference: string | null
          cost_basis: Database["public"]["Enums"]["task_cost_basis"] | null
          created_at: string
          created_by: string
          crew_size: number | null
          default_labor_hours: number | null
          default_overhead_pct: number | null
          default_scope_description: string | null
          direct_unit_cost: number | null
          equipment_cost: number | null
          equipment_requirements: string | null
          estimated_duration_hours: number | null
          id: string
          inspection_notes: string | null
          internal_notes: string | null
          is_disabled: boolean
          keywords: string[] | null
          library_version: number
          material_allowance: number | null
          measurement_method: string | null
          min_task_hours: number | null
          organization_id: string
          other_cost: number | null
          production_rate: number | null
          productivity_convention: string | null
          rate_note: string | null
          safety_notes: string | null
          setup_hours: number | null
          skill_level: string | null
          source_version: string | null
          suggested_markup_pct: number | null
          suggested_profit_pct: number | null
          typical_dependencies: string[] | null
          unit_key: Database["public"]["Enums"]["scope_unit"] | null
          updated_at: string
          updated_by: string | null
          waste_factor: number | null
          work_item: string | null
        }
        Insert: {
          archived_at?: string | null
          assembly_key: string
          client_description?: string | null
          code_reference?: string | null
          cost_basis?: Database["public"]["Enums"]["task_cost_basis"] | null
          created_at?: string
          created_by?: string
          crew_size?: number | null
          default_labor_hours?: number | null
          default_overhead_pct?: number | null
          default_scope_description?: string | null
          direct_unit_cost?: number | null
          equipment_cost?: number | null
          equipment_requirements?: string | null
          estimated_duration_hours?: number | null
          id?: string
          inspection_notes?: string | null
          internal_notes?: string | null
          is_disabled?: boolean
          keywords?: string[] | null
          library_version: number
          material_allowance?: number | null
          measurement_method?: string | null
          min_task_hours?: number | null
          organization_id: string
          other_cost?: number | null
          production_rate?: number | null
          productivity_convention?: string | null
          rate_note?: string | null
          safety_notes?: string | null
          setup_hours?: number | null
          skill_level?: string | null
          source_version?: string | null
          suggested_markup_pct?: number | null
          suggested_profit_pct?: number | null
          typical_dependencies?: string[] | null
          unit_key?: Database["public"]["Enums"]["scope_unit"] | null
          updated_at?: string
          updated_by?: string | null
          waste_factor?: number | null
          work_item?: string | null
        }
        Update: {
          archived_at?: string | null
          assembly_key?: string
          client_description?: string | null
          code_reference?: string | null
          cost_basis?: Database["public"]["Enums"]["task_cost_basis"] | null
          created_at?: string
          created_by?: string
          crew_size?: number | null
          default_labor_hours?: number | null
          default_overhead_pct?: number | null
          default_scope_description?: string | null
          direct_unit_cost?: number | null
          equipment_cost?: number | null
          equipment_requirements?: string | null
          estimated_duration_hours?: number | null
          id?: string
          inspection_notes?: string | null
          internal_notes?: string | null
          is_disabled?: boolean
          keywords?: string[] | null
          library_version?: number
          material_allowance?: number | null
          measurement_method?: string | null
          min_task_hours?: number | null
          organization_id?: string
          other_cost?: number | null
          production_rate?: number | null
          productivity_convention?: string | null
          rate_note?: string | null
          safety_notes?: string | null
          setup_hours?: number | null
          skill_level?: string | null
          source_version?: string | null
          suggested_markup_pct?: number | null
          suggested_profit_pct?: number | null
          typical_dependencies?: string[] | null
          unit_key?: Database["public"]["Enums"]["scope_unit"] | null
          updated_at?: string
          updated_by?: string | null
          waste_factor?: number | null
          work_item?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_assembly_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_products: {
        Row: {
          access_status: string
          created_at: string
          organization_id: string
          product_key: string
          settings: Json
          updated_at: string
        }
        Insert: {
          access_status?: string
          created_at?: string
          organization_id: string
          product_key: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          access_status?: string
          created_at?: string
          organization_id?: string
          product_key?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_products_product_key_fkey"
            columns: ["product_key"]
            isOneToOne: false
            referencedRelation: "platform_products"
            referencedColumns: ["key"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          organization_id: string
          price_id: string | null
          product_key: string
          provider: string
          provider_customer_id: string | null
          provider_metadata: Json
          provider_subscription_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          organization_id: string
          price_id?: string | null
          product_key?: string
          provider?: string
          provider_customer_id?: string | null
          provider_metadata?: Json
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          organization_id?: string
          price_id?: string | null
          product_key?: string
          provider?: string
          provider_customer_id?: string | null
          provider_metadata?: Json
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          brand_accent_color: string | null
          business_name: string | null
          city: string | null
          contractor_network_id: string | null
          country: string | null
          created_at: string
          currency: string
          default_crew_size: number
          default_labor_rate: number
          default_overhead_pct: number
          default_pricing_method: string
          default_productive_hours_per_day: number
          default_productivity_multiplier: number
          default_profit_pct: number
          default_target_gross_margin_pct: number
          email: string | null
          id: string
          language: string
          license_number: string | null
          license_state: string | null
          logo_url: string | null
          measurement_system: Database["public"]["Enums"]["measurement_system"]
          organization_name: string
          phone: string | null
          postal_code: string | null
          preferred_project_scale: string | null
          primary_business_type: string | null
          primary_trade: string | null
          region: string | null
          secondary_business_types: string[]
          service_specialties: string[]
          tax_rate: number | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          brand_accent_color?: string | null
          business_name?: string | null
          city?: string | null
          contractor_network_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          default_crew_size?: number
          default_labor_rate?: number
          default_overhead_pct?: number
          default_pricing_method?: string
          default_productive_hours_per_day?: number
          default_productivity_multiplier?: number
          default_profit_pct?: number
          default_target_gross_margin_pct?: number
          email?: string | null
          id?: string
          language?: string
          license_number?: string | null
          license_state?: string | null
          logo_url?: string | null
          measurement_system?: Database["public"]["Enums"]["measurement_system"]
          organization_name: string
          phone?: string | null
          postal_code?: string | null
          preferred_project_scale?: string | null
          primary_business_type?: string | null
          primary_trade?: string | null
          region?: string | null
          secondary_business_types?: string[]
          service_specialties?: string[]
          tax_rate?: number | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          brand_accent_color?: string | null
          business_name?: string | null
          city?: string | null
          contractor_network_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          default_crew_size?: number
          default_labor_rate?: number
          default_overhead_pct?: number
          default_pricing_method?: string
          default_productive_hours_per_day?: number
          default_productivity_multiplier?: number
          default_profit_pct?: number
          default_target_gross_margin_pct?: number
          email?: string | null
          id?: string
          language?: string
          license_number?: string | null
          license_state?: string | null
          logo_url?: string | null
          measurement_system?: Database["public"]["Enums"]["measurement_system"]
          organization_name?: string
          phone?: string | null
          postal_code?: string | null
          preferred_project_scale?: string | null
          primary_business_type?: string | null
          primary_trade?: string | null
          region?: string | null
          secondary_business_types?: string[]
          service_specialties?: string[]
          tax_rate?: number | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      permit_fee_rules: {
        Row: {
          base_amount: number | null
          bundles: string[]
          calc_method: string
          city: string | null
          confidence: string
          country_code: string
          county: string | null
          created_at: string
          created_by: string | null
          effective_date: string
          high_amount: number | null
          id: string
          is_active: boolean
          jurisdiction_scope: string
          library_version: string
          low_amount: number | null
          max_amount: number | null
          min_amount: number | null
          notes: string | null
          organization_id: string | null
          permit_type: string
          postal_code: string | null
          rate: number | null
          rule_key: string
          source_title: string
          source_type: string
          source_url: string | null
          state: string | null
          updated_at: string
          work_class: string
        }
        Insert: {
          base_amount?: number | null
          bundles?: string[]
          calc_method: string
          city?: string | null
          confidence?: string
          country_code?: string
          county?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string
          high_amount?: number | null
          id?: string
          is_active?: boolean
          jurisdiction_scope: string
          library_version: string
          low_amount?: number | null
          max_amount?: number | null
          min_amount?: number | null
          notes?: string | null
          organization_id?: string | null
          permit_type: string
          postal_code?: string | null
          rate?: number | null
          rule_key: string
          source_title: string
          source_type: string
          source_url?: string | null
          state?: string | null
          updated_at?: string
          work_class?: string
        }
        Update: {
          base_amount?: number | null
          bundles?: string[]
          calc_method?: string
          city?: string | null
          confidence?: string
          country_code?: string
          county?: string | null
          created_at?: string
          created_by?: string | null
          effective_date?: string
          high_amount?: number | null
          id?: string
          is_active?: boolean
          jurisdiction_scope?: string
          library_version?: string
          low_amount?: number | null
          max_amount?: number | null
          min_amount?: number | null
          notes?: string | null
          organization_id?: string | null
          permit_type?: string
          postal_code?: string | null
          rate?: number | null
          rule_key?: string
          source_title?: string
          source_type?: string
          source_url?: string | null
          state?: string | null
          updated_at?: string
          work_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_fee_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_products: {
        Row: {
          created_at: string
          display_name_key: string
          is_active: boolean
          key: string
        }
        Insert: {
          created_at?: string
          display_name_key: string
          is_active?: boolean
          key: string
        }
        Update: {
          created_at?: string
          display_name_key?: string
          is_active?: boolean
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          language: string
          last_name: string | null
          measurement_preference: Database["public"]["Enums"]["measurement_system"]
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          language?: string
          last_name?: string | null
          measurement_preference?: Database["public"]["Enums"]["measurement_system"]
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          language?: string
          last_name?: string | null
          measurement_preference?: Database["public"]["Enums"]["measurement_system"]
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          actor_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["activity_entity_type"]
          id: string
          metadata: Json
          organization_id: string
          project_id: string
          summary: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          actor_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type: Database["public"]["Enums"]["activity_entity_type"]
          id?: string
          metadata?: Json
          organization_id: string
          project_id: string
          summary?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          actor_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["activity_entity_type"]
          id?: string
          metadata?: Json
          organization_id?: string
          project_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_size: number
          id: string
          mime_type: string
          organization_id: string
          project_id: string
          room_id: string | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          organization_id: string
          project_id: string
          room_id?: string | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          organization_id?: string
          project_id?: string
          room_id?: string | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_measurement_captures: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string | null
          file_name: string | null
          id: string
          organization_id: string
          project_id: string
          source: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          file_name?: string | null
          id?: string
          organization_id: string
          project_id: string
          source: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          file_name?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          source?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_measurement_captures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_measurement_captures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_measurement_captures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_measurement_items: {
        Row: {
          capture_id: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          flag: string | null
          id: string
          inches: number
          kind: string
          label: string
          organization_id: string
          overridden_at: string | null
          project_id: string
          raw_text: string | null
          secondary_inches: number | null
          source: string
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          capture_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          flag?: string | null
          id?: string
          inches: number
          kind?: string
          label?: string
          organization_id: string
          overridden_at?: string | null
          project_id: string
          raw_text?: string | null
          secondary_inches?: number | null
          source: string
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          capture_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          flag?: string | null
          id?: string
          inches?: number
          kind?: string
          label?: string
          organization_id?: string
          overridden_at?: string | null
          project_id?: string
          raw_text?: string | null
          secondary_inches?: number | null
          source?: string
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_measurement_items_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "project_measurement_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_measurement_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_measurement_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_measurement_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_measurements: {
        Row: {
          ceiling_height_ft: number | null
          created_at: string
          created_by: string
          floor_waste_pct: number
          id: string
          interior_partition_lf: number | null
          label: string | null
          length_ft: number | null
          notes: string | null
          openings: Json
          organization_id: string
          project_id: string
          quantities_stale_at: string | null
          quantities_stale_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          unconfirmed_fields: string[]
          updated_at: string
          width_ft: number | null
        }
        Insert: {
          ceiling_height_ft?: number | null
          created_at?: string
          created_by?: string
          floor_waste_pct?: number
          id?: string
          interior_partition_lf?: number | null
          label?: string | null
          length_ft?: number | null
          notes?: string | null
          openings?: Json
          organization_id: string
          project_id: string
          quantities_stale_at?: string | null
          quantities_stale_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          unconfirmed_fields?: string[]
          updated_at?: string
          width_ft?: number | null
        }
        Update: {
          ceiling_height_ft?: number | null
          created_at?: string
          created_by?: string
          floor_waste_pct?: number
          id?: string
          interior_partition_lf?: number | null
          label?: string | null
          length_ft?: number | null
          notes?: string | null
          openings?: Json
          organization_id?: string
          project_id?: string
          quantities_stale_at?: string | null
          quantities_stale_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          unconfirmed_fields?: string[]
          updated_at?: string
          width_ft?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_measurements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_measurements_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_media_understanding: {
        Row: {
          analyzed_at: string | null
          created_at: string
          created_by: string
          id: string
          media_fingerprint: string | null
          organization_id: string
          project_id: string
          spoken_narration: string | null
          updated_at: string
          visual_observations: Json
          visual_status: string
        }
        Insert: {
          analyzed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          media_fingerprint?: string | null
          organization_id: string
          project_id: string
          spoken_narration?: string | null
          updated_at?: string
          visual_observations?: Json
          visual_status?: string
        }
        Update: {
          analyzed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          media_fingerprint?: string | null
          organization_id?: string
          project_id?: string
          spoken_narration?: string | null
          updated_at?: string
          visual_observations?: Json
          visual_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_media_understanding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_media_understanding_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_narrative_scopes: {
        Row: {
          answers: Json
          approval_history: Json
          approved_at: string | null
          approved_scope_fingerprint: string | null
          approved_text: string | null
          created_at: string
          created_by: string
          edited_text: string | null
          id: string
          organization_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          approval_history?: Json
          approved_at?: string | null
          approved_scope_fingerprint?: string | null
          approved_text?: string | null
          created_at?: string
          created_by: string
          edited_text?: string | null
          id?: string
          organization_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          approval_history?: Json
          approved_at?: string | null
          approved_scope_fingerprint?: string | null
          approved_text?: string | null
          created_at?: string
          created_by?: string
          edited_text?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_narrative_scopes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_narrative_scopes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          created_by: string
          id: string
          is_internal: boolean
          note_type: Database["public"]["Enums"]["note_type"]
          organization_id: string
          project_id: string
          room_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          created_at?: string
          created_by?: string
          id?: string
          is_internal?: boolean
          note_type?: Database["public"]["Enums"]["note_type"]
          organization_id: string
          project_id: string
          room_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          is_internal?: boolean
          note_type?: Database["public"]["Enums"]["note_type"]
          organization_id?: string
          project_id?: string
          room_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_photos: {
        Row: {
          alt_text: string | null
          archived_at: string | null
          caption: string | null
          created_at: string
          created_by: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          organization_id: string
          photo_type: Database["public"]["Enums"]["photo_type"]
          project_id: string
          room_id: string | null
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          archived_at?: string | null
          caption?: string | null
          created_at?: string
          created_by?: string
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          organization_id: string
          photo_type?: Database["public"]["Enums"]["photo_type"]
          project_id: string
          room_id?: string | null
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          archived_at?: string | null
          caption?: string | null
          created_at?: string
          created_by?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          organization_id?: string
          photo_type?: Database["public"]["Enums"]["photo_type"]
          project_id?: string
          room_id?: string | null
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_photos_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_rooms: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          floor_level: string | null
          id: string
          name: string
          organization_id: string
          project_id: string
          room_type: Database["public"]["Enums"]["room_type"]
          sort_order: number
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          floor_level?: string | null
          id?: string
          name: string
          organization_id: string
          project_id: string
          room_type?: Database["public"]["Enums"]["room_type"]
          sort_order?: number
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          floor_level?: string | null
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
          room_type?: Database["public"]["Enums"]["room_type"]
          sort_order?: number
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_rooms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          client_id: string
          cover_photo_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          internal_notes: string | null
          last_activity_at: string
          name: string
          organization_id: string
          priority: Database["public"]["Enums"]["project_priority"]
          project_category_key: string | null
          project_scale_key: string | null
          project_subtype_custom: string | null
          project_subtype_key: string | null
          project_type: string | null
          project_type_custom: string | null
          project_type_key: string | null
          property_id: string
          status: Database["public"]["Enums"]["project_status"]
          target_completion: string | null
          target_gross_margin: number | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          client_id: string
          cover_photo_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          last_activity_at?: string
          name: string
          organization_id: string
          priority?: Database["public"]["Enums"]["project_priority"]
          project_category_key?: string | null
          project_scale_key?: string | null
          project_subtype_custom?: string | null
          project_subtype_key?: string | null
          project_type?: string | null
          project_type_custom?: string | null
          project_type_key?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["project_status"]
          target_completion?: string | null
          target_gross_margin?: number | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          client_id?: string
          cover_photo_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          last_activity_at?: string
          name?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["project_priority"]
          project_category_key?: string | null
          project_scale_key?: string | null
          project_subtype_custom?: string | null
          project_subtype_key?: string | null
          project_type?: string | null
          project_type_custom?: string | null
          project_type_key?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          target_completion?: string | null
          target_gross_margin?: number | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "project_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          archived_at: string | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          client_id: string
          construction_type: string | null
          county: string | null
          created_at: string
          created_by: string
          gps: Json | null
          id: string
          nickname: string | null
          notes: string | null
          occupied: boolean | null
          organization_id: string
          postal_code: string | null
          region: string | null
          square_footage: number | null
          stories: number | null
          street: string | null
          updated_at: string
          year_built: number | null
        }
        Insert: {
          archived_at?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          client_id: string
          construction_type?: string | null
          county?: string | null
          created_at?: string
          created_by: string
          gps?: Json | null
          id?: string
          nickname?: string | null
          notes?: string | null
          occupied?: boolean | null
          organization_id: string
          postal_code?: string | null
          region?: string | null
          square_footage?: number | null
          stories?: number | null
          street?: string | null
          updated_at?: string
          year_built?: number | null
        }
        Update: {
          archived_at?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          client_id?: string
          construction_type?: string | null
          county?: string | null
          created_at?: string
          created_by?: string
          gps?: Json | null
          id?: string
          nickname?: string | null
          notes?: string | null
          occupied?: boolean | null
          organization_id?: string
          postal_code?: string | null
          region?: string | null
          square_footage?: number | null
          stories?: number | null
          street?: string | null
          updated_at?: string
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_change_requests: {
        Row: {
          contractor_note: string | null
          created_at: string
          id: string
          kind: string
          message: string
          organization_id: string
          project_id: string
          requester_email: string | null
          requester_name: string | null
          resolved_at: string | null
          resolved_by: string | null
          selections: Json
          share_id: string
          share_version: number
          status: string
          updated_at: string
        }
        Insert: {
          contractor_note?: string | null
          created_at?: string
          id?: string
          kind?: string
          message: string
          organization_id: string
          project_id: string
          requester_email?: string | null
          requester_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          selections?: Json
          share_id: string
          share_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          contractor_note?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string
          organization_id?: string
          project_id?: string
          requester_email?: string | null
          requester_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          selections?: Json
          share_id?: string
          share_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_change_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_change_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_change_requests_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "proposal_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_shares: {
        Row: {
          created_at: string
          created_by: string
          delivery_detail: string | null
          delivery_status: string
          document: Json
          estimate_id: string | null
          expires_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          locale: string
          logo_path: string | null
          media_paths: string[]
          message: string | null
          organization_id: string
          project_id: string
          recipient_email: string
          recipient_name: string | null
          revoked_at: string | null
          sent_at: string
          share_version: number
          status: string
          subject: string | null
          template: string | null
          token_hash: string
          updated_at: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          delivery_detail?: string | null
          delivery_status?: string
          document: Json
          estimate_id?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          locale?: string
          logo_path?: string | null
          media_paths?: string[]
          message?: string | null
          organization_id: string
          project_id: string
          recipient_email: string
          recipient_name?: string | null
          revoked_at?: string | null
          sent_at?: string
          share_version?: number
          status?: string
          subject?: string | null
          template?: string | null
          token_hash: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          delivery_detail?: string | null
          delivery_status?: string
          document?: Json
          estimate_id?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          locale?: string
          logo_path?: string | null
          media_paths?: string[]
          message?: string | null
          organization_id?: string
          project_id?: string
          recipient_email?: string
          recipient_name?: string | null
          revoked_at?: string | null
          sent_at?: string
          share_version?: number
          status?: string
          subject?: string | null
          template?: string | null
          token_hash?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_item_documents: {
        Row: {
          created_at: string
          organization_id: string
          project_document_id: string
          project_id: string
          scope_item_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          project_document_id: string
          project_id: string
          scope_item_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          project_document_id?: string
          project_id?: string
          scope_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_item_documents_project_document_id_fkey"
            columns: ["project_document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_item_documents_scope_item_id_fkey"
            columns: ["scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_item_photos: {
        Row: {
          created_at: string
          organization_id: string
          project_id: string
          project_photo_id: string
          scope_item_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          project_id: string
          project_photo_id: string
          scope_item_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          project_id?: string
          project_photo_id?: string
          scope_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_item_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_item_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_item_photos_project_photo_id_fkey"
            columns: ["project_photo_id"]
            isOneToOne: false
            referencedRelation: "project_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_item_photos_scope_item_id_fkey"
            columns: ["scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_items: {
        Row: {
          action_key: Database["public"]["Enums"]["scope_action"] | null
          archived_at: string | null
          assumptions: string | null
          category_key: string | null
          completion_status: Database["public"]["Enums"]["scope_completion"]
          confidence_status:
            | Database["public"]["Enums"]["scope_confidence"]
            | null
          created_at: string
          created_by: string
          customer_notes: string | null
          description: string | null
          exclusions: string | null
          finish_selection: string | null
          id: string
          internal_notes: string | null
          is_client_visible: boolean
          is_customer_selection: boolean
          is_included: boolean
          labor_notes: string | null
          material_selection: string | null
          organization_id: string
          origin_at: string
          origin_ref: string | null
          origin_type: string
          priority: Database["public"]["Enums"]["scope_priority"]
          project_id: string
          quantity: number | null
          quantity_basis: string | null
          quantity_basis_formula: Json
          quantity_basis_note: string | null
          quantity_source_measurement_id: string | null
          room_id: string | null
          scope_item_key: string | null
          section_id: string
          sort_order: number
          subcategory_key: string | null
          title: string
          trade_key: string | null
          unit_key: Database["public"]["Enums"]["scope_unit"] | null
          updated_at: string
        }
        Insert: {
          action_key?: Database["public"]["Enums"]["scope_action"] | null
          archived_at?: string | null
          assumptions?: string | null
          category_key?: string | null
          completion_status?: Database["public"]["Enums"]["scope_completion"]
          confidence_status?:
            | Database["public"]["Enums"]["scope_confidence"]
            | null
          created_at?: string
          created_by?: string
          customer_notes?: string | null
          description?: string | null
          exclusions?: string | null
          finish_selection?: string | null
          id?: string
          internal_notes?: string | null
          is_client_visible?: boolean
          is_customer_selection?: boolean
          is_included?: boolean
          labor_notes?: string | null
          material_selection?: string | null
          organization_id: string
          origin_at?: string
          origin_ref?: string | null
          origin_type?: string
          priority?: Database["public"]["Enums"]["scope_priority"]
          project_id: string
          quantity?: number | null
          quantity_basis?: string | null
          quantity_basis_formula?: Json
          quantity_basis_note?: string | null
          quantity_source_measurement_id?: string | null
          room_id?: string | null
          scope_item_key?: string | null
          section_id: string
          sort_order?: number
          subcategory_key?: string | null
          title: string
          trade_key?: string | null
          unit_key?: Database["public"]["Enums"]["scope_unit"] | null
          updated_at?: string
        }
        Update: {
          action_key?: Database["public"]["Enums"]["scope_action"] | null
          archived_at?: string | null
          assumptions?: string | null
          category_key?: string | null
          completion_status?: Database["public"]["Enums"]["scope_completion"]
          confidence_status?:
            | Database["public"]["Enums"]["scope_confidence"]
            | null
          created_at?: string
          created_by?: string
          customer_notes?: string | null
          description?: string | null
          exclusions?: string | null
          finish_selection?: string | null
          id?: string
          internal_notes?: string | null
          is_client_visible?: boolean
          is_customer_selection?: boolean
          is_included?: boolean
          labor_notes?: string | null
          material_selection?: string | null
          organization_id?: string
          origin_at?: string
          origin_ref?: string | null
          origin_type?: string
          priority?: Database["public"]["Enums"]["scope_priority"]
          project_id?: string
          quantity?: number | null
          quantity_basis?: string | null
          quantity_basis_formula?: Json
          quantity_basis_note?: string | null
          quantity_source_measurement_id?: string | null
          room_id?: string | null
          scope_item_key?: string | null
          section_id?: string
          sort_order?: number
          subcategory_key?: string | null
          title?: string
          trade_key?: string | null
          unit_key?: Database["public"]["Enums"]["scope_unit"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "scope_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_sections: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          organization_id: string
          project_id: string
          room_id: string | null
          section_key: string | null
          sort_order: number
          status: string
          trade_key: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          project_id: string
          room_id?: string | null
          section_key?: string | null
          sort_order?: number
          status?: string
          trade_key?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
          room_id?: string | null
          section_key?: string | null
          sort_order?: number
          status?: string
          trade_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_sections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "project_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_templates: {
        Row: {
          business_type_key: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system_template: boolean
          name: string
          organization_id: string | null
          project_category_key: string | null
          project_subtype_key: string | null
          project_type_key: string | null
          template_data: Json
          template_key: string
          updated_at: string
        }
        Insert: {
          business_type_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          name: string
          organization_id?: string | null
          project_category_key?: string | null
          project_subtype_key?: string | null
          project_type_key?: string | null
          template_data?: Json
          template_key: string
          updated_at?: string
        }
        Update: {
          business_type_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system_template?: boolean
          name?: string
          organization_id?: string | null
          project_category_key?: string | null
          project_subtype_key?: string | null
          project_type_key?: string | null
          template_data?: Json
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_validation_decisions: {
        Row: {
          created_at: string
          decided_by: string | null
          decided_trade_key: string | null
          decision: string
          finding_kind: string
          id: string
          item_ids: string[]
          organization_id: string
          project_id: string
          subject_fingerprint: string
          subject_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          decided_trade_key?: string | null
          decision: string
          finding_kind: string
          id?: string
          item_ids?: string[]
          organization_id: string
          project_id: string
          subject_fingerprint: string
          subject_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          decided_trade_key?: string | null
          decision?: string
          finding_kind?: string
          id?: string
          item_ids?: string[]
          organization_id?: string
          project_id?: string
          subject_fingerprint?: string
          subject_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_validation_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_validation_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          app_version: string | null
          category: string
          contact_preference: string
          contact_value: string | null
          created_at: string
          diagnostics: Json
          id: string
          message: string | null
          organization_id: string | null
          reference_id: string | null
          route: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          category?: string
          contact_preference?: string
          contact_value?: string | null
          created_at?: string
          diagnostics?: Json
          id?: string
          message?: string | null
          organization_id?: string | null
          reference_id?: string | null
          route?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          category?: string
          contact_preference?: string
          contact_value?: string | null
          created_at?: string
          diagnostics?: Json
          id?: string
          message?: string | null
          organization_id?: string | null
          reference_id?: string | null
          route?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      us_state_codes: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          display_density: string
          marketing_opt_in: boolean
          notification_email: boolean
          notification_push: boolean
          notification_sms: boolean
          text_size: string
          theme: string
          updated_at: string
          use_device_text_size: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          display_density?: string
          marketing_opt_in?: boolean
          notification_email?: boolean
          notification_push?: boolean
          notification_sms?: boolean
          text_size?: string
          theme?: string
          updated_at?: string
          use_device_text_size?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          display_density?: string
          marketing_opt_in?: boolean
          notification_email?: boolean
          notification_push?: boolean
          notification_sms?: boolean
          text_size?: string
          theme?: string
          updated_at?: string
          use_device_text_size?: boolean
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_assembly_template: {
        Args: { _project_id: string; _room_id?: string; _template_id: string }
        Returns: Json
      }
      apply_ballpark_task_pricing: {
        Args: { _estimate_id: string; _tasks: Json }
        Returns: number
      }
      apply_book_labor_rates: {
        Args: { _estimate_id: string }
        Returns: number
      }
      apply_book_line_pricing: {
        Args: { _estimate_id: string }
        Returns: number
      }
      apply_book_pricing: { Args: { _estimate_id: string }; Returns: number }
      apply_composite_assembly: {
        Args: {
          _components: Json
          _composite_key: string
          _description?: string
          _line_id: string
          _pricing?: Json
          _quantity?: number
          _unit_key?: Database["public"]["Enums"]["scope_unit"]
        }
        Returns: Json
      }
      apply_geometry_quantities: {
        Args: { _assignments: Json; _estimate_id: string }
        Returns: Json
      }
      apply_knowledge_base_pricing: {
        Args: { _estimate_id: string; _pricing?: Json }
        Returns: Json
      }
      apply_location_equipment_factor: {
        Args: { _estimate_id: string }
        Returns: number
      }
      apply_pinned_catalog_productivity: {
        Args: { _estimate_id: string }
        Returns: number
      }
      apply_scope_template: {
        Args: {
          _allow_append: boolean
          _confirm_mismatch?: boolean
          _project_id: string
          _room_id: string
          _template_id: string
        }
        Returns: Json
      }
      assembly_allowance_eligible: {
        Args: { _assembly_key: string }
        Returns: boolean
      }
      assembly_hours_per_unit: {
        Args: { _convention: string; _hours: number; _rate: number }
        Returns: number
      }
      assert_editable_estimate_line: {
        Args: { _line_id: string }
        Returns: {
          archived_at: string | null
          assembly_component_id: string | null
          assembly_component_quantities: Json | null
          assembly_expansion_id: string | null
          assembly_expansion_status: string | null
          assembly_geometry: Json | null
          catalog_confirmed_at: string | null
          catalog_confirmed_by: string | null
          catalog_item_key: string | null
          catalog_mapping_source: string | null
          category_key: string | null
          contingency_pct: number
          cost_basis: Database["public"]["Enums"]["task_cost_basis"] | null
          cost_basis_repaired_at: string | null
          cost_basis_source: string | null
          cost_book_applied_at: string | null
          created_at: string
          created_by: string
          description: string
          direct_cost: number | null
          equipment_cost: number
          equipment_total: number | null
          estimate_id: string
          group_label: string | null
          id: string
          internal_notes: string | null
          is_client_visible: boolean
          is_price_overridden: boolean
          is_quantity_placeholder: boolean
          is_taxable: boolean
          labor_convention: string | null
          labor_hours: number
          labor_hours_basis: string | null
          labor_hours_confirmed_at: string | null
          labor_hours_confirmed_by: string | null
          labor_hours_flag: string | null
          labor_hours_formula: string | null
          labor_hours_per_unit: number | null
          labor_hours_previous: number | null
          labor_hours_repaired_at: string | null
          labor_hours_setup: number
          labor_rate: number
          labor_total: number | null
          material_cost: number
          material_total: number | null
          organization_id: string
          origin_at: string
          origin_ref: string | null
          origin_type: string
          other_cost: number
          other_total: number | null
          overhead_pct: number
          parent_line_id: string | null
          priced_at: string | null
          pricing_basis: Json | null
          pricing_provenance: Json
          pricing_source: string | null
          profit_pct: number
          project_id: string
          quantity: number
          quantity_basis: string | null
          quantity_basis_formula: Json
          quantity_basis_note: string | null
          quantity_is_assumed_default: boolean
          quantity_reviewed_at: string | null
          quantity_reviewed_by: string | null
          quantity_source_measurement_id: string | null
          rate_override_at: string | null
          rate_override_by: string | null
          rate_override_equipment_cost: number | null
          rate_override_hours_per_unit: number | null
          rate_override_labor_rate: number | null
          rate_override_material_unit_cost: number | null
          rate_override_note: string | null
          rate_override_other_cost: number | null
          rate_override_setup_hours: number | null
          resolution_status: Database["public"]["Enums"]["line_resolution_status"]
          room_id: string | null
          scope_item_id: string | null
          scope_section_id: string | null
          sort_order: number
          subcategory_key: string | null
          subcontractor_cost: number
          subcontractor_total: number | null
          trade_key: string | null
          trade_source: string | null
          unit_key: Database["public"]["Enums"]["scope_unit"] | null
          unresolved_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "estimate_line_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_project_in_active_org: {
        Args: { _project_id: string }
        Returns: string
      }
      audit_client_deletion: { Args: { p_client_id: string }; Returns: Json }
      audit_estimate_math: {
        Args: { _dry_run?: boolean; _estimate_id?: string }
        Returns: {
          action: string
          code: string
          description: string
          estimate_id: string
          line_id: string
          new_value: number
          old_value: number
        }[]
      }
      audit_project_deletion: { Args: { p_project_id: string }; Returns: Json }
      bind_unpriced_estimate_lines: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      bulk_update_scope_inclusion: {
        Args: {
          _is_included: boolean
          _item_ids: string[]
          _project_id: string
        }
        Returns: number
      }
      bump_terminology_correction_usage: {
        Args: { _ids: string[]; _org_id: string }
        Returns: undefined
      }
      can_delete_org_records: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      catalog_mapping_is_semantic: {
        Args: { p_description: string; p_key: string }
        Returns: boolean
      }
      clear_phantom_price_overrides: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      confirm_estimate_line_catalog: {
        Args: {
          _assembly_key: string
          _description?: string
          _line_id: string
          _pricing?: Json
          _quantity?: number
          _unit_key?: Database["public"]["Enums"]["scope_unit"]
        }
        Returns: Json
      }
      copy_estimate_to_project: {
        Args: {
          _options?: Json
          _source_estimate_id: string
          _target_project_id: string
        }
        Returns: Json
      }
      cost_book_entry: {
        Args: { _assembly_key: string; _org: string }
        Returns: Json
      }
      create_estimate_from_scope: {
        Args: { _pricing?: Json; _project_id: string; _title?: string }
        Returns: string
      }
      create_estimate_revision: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      create_estimate_version: {
        Args: { _estimate_id: string }
        Returns: string
      }
      create_organization_for_current_user: {
        Args: { payload: Json }
        Returns: {
          address_line1: string | null
          address_line2: string | null
          brand_accent_color: string | null
          business_name: string | null
          city: string | null
          contractor_network_id: string | null
          country: string | null
          created_at: string
          currency: string
          default_crew_size: number
          default_labor_rate: number
          default_overhead_pct: number
          default_pricing_method: string
          default_productive_hours_per_day: number
          default_productivity_multiplier: number
          default_profit_pct: number
          default_target_gross_margin_pct: number
          email: string | null
          id: string
          language: string
          license_number: string | null
          license_state: string | null
          logo_url: string | null
          measurement_system: Database["public"]["Enums"]["measurement_system"]
          organization_name: string
          phone: string | null
          postal_code: string | null
          preferred_project_scale: string | null
          primary_business_type: string | null
          primary_trade: string | null
          region: string | null
          secondary_business_types: string[]
          service_specialties: string[]
          tax_rate: number | null
          timezone: string
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_active_organization_id: { Args: never; Returns: string }
      default_unit_for_basis: {
        Args: { _b: Database["public"]["Enums"]["task_cost_basis"] }
        Returns: Database["public"]["Enums"]["scope_unit"]
      }
      delete_client_permanently: {
        Args: { p_client_id: string; p_delete_dependents?: boolean }
        Returns: Json
      }
      delete_project_permanently: {
        Args: { p_project_id: string }
        Returns: Json
      }
      delete_scope_item: { Args: { _item_id: string }; Returns: undefined }
      derive_geometry_quantities: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      discard_estimate_ballpark_draft: {
        Args: { _estimate_id: string }
        Returns: {
          answers: Json
          assumed_values: Json
          completed_payload: Json | null
          confidence: string | null
          confirmed_values: Json
          contractor_overrides: Json
          created_at: string
          created_by: string
          current_question_id: string | null
          current_stage: string
          derived_geometry: Json
          derived_quantities: Json
          draft_preview: Json | null
          estimate_id: string
          frozen_question_ids: Json
          id: string
          inferred_values: Json
          intake_source: string
          interview_type: string
          organization_id: string
          payload: Json
          photo_analysis: Json
          photo_references: Json
          project_id: string
          range_inputs: Json
          range_snapshot: Json | null
          schema_key: string
          schema_version: number
          transcripts: Json
          unknowns: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "estimate_ballpark_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      duplicate_assembly: {
        Args: { _assembly_key: string; _new_key?: string }
        Returns: string
      }
      duplicate_scope_item: { Args: { _item_id: string }; Returns: string }
      enforce_estimate_pricing_method: {
        Args: { _estimate_id: string }
        Returns: undefined
      }
      estimate_invariant_cost: { Args: { _estimate_id: string }; Returns: Json }
      estimate_is_editable: { Args: { _estimate_id: string }; Returns: boolean }
      flag_zero_priced_estimate_lines: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      generic_trade_fallback_rate: {
        Args: { _trade: string; _unit: string }
        Returns: Json
      }
      generic_unit_family: { Args: { _unit: string }; Returns: string }
      geometry_basis_kind: { Args: { _surface: string }; Returns: string }
      geometry_surface_for_line: {
        Args: { _catalog_key: string; _description: string; _unit: string }
        Returns: string
      }
      has_product_access: {
        Args: { _organization_id: string; _product_key: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      infer_cost_basis: {
        Args: { _category?: string; _description: string; _unit?: string }
        Returns: Database["public"]["Enums"]["task_cost_basis"]
      }
      infer_trade_key: {
        Args: { _category?: string; _description: string }
        Returns: string
      }
      insert_template_item:
        | {
            Args: {
              _item_index: number
              _project_id: string
              _room_id: string
              _section_index: number
              _target_section_id: string
              _template_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _confirm_mismatch?: boolean
              _item_index: number
              _project_id: string
              _room_id: string
              _section_index: number
              _target_section_id: string
              _template_id: string
            }
            Returns: string
          }
      insert_template_section:
        | {
            Args: {
              _project_id: string
              _room_id: string
              _section_index: number
              _template_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _confirm_mismatch?: boolean
              _project_id: string
              _room_id: string
              _section_index: number
              _template_id: string
            }
            Returns: string
          }
      is_contractor_owned_labor: {
        Args: {
          _row: Database["public"]["Tables"]["estimate_line_items"]["Row"]
        }
        Returns: boolean
      }
      is_fee_basis: {
        Args: { _b: Database["public"]["Enums"]["task_cost_basis"] }
        Returns: boolean
      }
      is_labor_bearing_basis: {
        Args: { _b: Database["public"]["Enums"]["task_cost_basis"] }
        Returns: boolean
      }
      is_measured_unit: { Args: { _u: string }; Returns: boolean }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      kb_apply_pricing: {
        Args: { _estimate_id: string; _only_new?: boolean; _pricing?: Json }
        Returns: Json
      }
      kb_norm: { Args: { _text: string }; Returns: string }
      kb_overlap: {
        Args: { _assembly: string; _scope: string }
        Returns: number
      }
      kb_resolved_assemblies: {
        Args: { _org: string }
        Returns: {
          assembly_key: string
          category_key: string
          cost_basis: Database["public"]["Enums"]["task_cost_basis"]
          crew_size: number
          default_labor_hours: number
          default_overhead_pct: number
          default_scope_description: string
          is_sample_data: boolean
          keywords: string[]
          material_allowance: number
          origin: string
          production_rate: number
          productivity_convention: string
          setup_hours: number
          subcategory_key: string
          suggested_markup_pct: number
          suggested_profit_pct: number
          synonyms: string[]
          trade_key: string
          unit_key: Database["public"]["Enums"]["scope_unit"]
          waste_factor: number
          work_item: string
        }[]
      }
      line_pricing_basis: { Args: { _line_id: string }; Returns: Json }
      min_task_hours: {
        Args: {
          _cost_basis: Database["public"]["Enums"]["task_cost_basis"]
          _description: string
          _trade: string
          _unit: Database["public"]["Enums"]["scope_unit"]
        }
        Returns: number
      }
      money_round: { Args: { _v: number }; Returns: number }
      move_scope_item: {
        Args: {
          _item_id: string
          _new_room_id: string
          _new_section_id: string
        }
        Returns: undefined
      }
      move_scope_item_to_position: {
        Args: {
          _item_id: string
          _new_index: number
          _new_room_id: string
          _new_section_id: string
        }
        Returns: undefined
      }
      nce_book_lookup: {
        Args: {
          _category?: string
          _description: string
          _extra_terms?: string
          _min_score?: number
          _trade_key?: string
        }
        Returns: {
          craft_code: string
          craft_hours: string
          description: string
          is_ambiguous: boolean
          labor: number
          material: number
          reference_id: number
          scope_mode: string
          score: number
          section: string
          shared_keywords: number
          total: number
          unit: string
        }[]
      }
      nce_craft_for_trade: { Args: { _trade_key: string }; Returns: string }
      nce_craft_hours_parts: {
        Args: { _craft_hours: string }
        Returns: {
          craft_code: string
          hours: number
        }[]
      }
      nce_estimate_location: {
        Args: { _estimate_id: string }
        Returns: {
          equipment_pct: number
          labor_pct: number
          location: string
          match_source: string
          material_pct: number
        }[]
      }
      nce_labor_multiplier: { Args: { _location?: string }; Returns: number }
      nce_labor_rate: {
        Args: { _craft_code: string; _location?: string; _trade_key: string }
        Returns: number
      }
      nce_labor_rate_factored: {
        Args: { _craft_code: string; _labor_factor: number; _trade_key: string }
        Returns: number
      }
      nce_location_factors: {
        Args: { _estimate_id: string }
        Returns: {
          display_total_pct: number
          equipment_factor: number
          equipment_pct: number
          labor_factor: number
          labor_pct: number
          location: string
          match_source: string
          material_factor: number
          material_pct: number
        }[]
      }
      nce_material_multiplier: { Args: { _location?: string }; Returns: number }
      nce_resolve_location: {
        Args: { _override?: string; _postal?: string; _state?: string }
        Returns: {
          equipment_pct: number
          labor_pct: number
          location: string
          match_source: string
          material_pct: number
        }[]
      }
      nce_section_patterns: {
        Args: { _category_key: string; _trade_key: string }
        Returns: string[]
      }
      nce_sync_estimate_location: {
        Args: { _estimate_id: string }
        Returns: undefined
      }
      nce_unit_scale: {
        Args: { _book_unit: string; _line_unit: string }
        Returns: number
      }
      price_unmatched_lines: { Args: { _estimate_id: string }; Returns: Json }
      project_geometry_basis: { Args: { _project_id: string }; Returns: Json }
      quantity_is_composite_scope: {
        Args: { p_description: string; p_quantity: number; p_unit: string }
        Returns: boolean
      }
      quantity_is_size_not_count: {
        Args: { _description: string; _quantity: number; _unit: string }
        Returns: boolean
      }
      quantity_needs_count: {
        Args: {
          _description: string
          _placeholder: boolean
          _qty: number
          _unit: string
        }
        Returns: boolean
      }
      quantity_scope_kind: {
        Args: { _catalog_key: string; _description: string }
        Returns: string
      }
      rebuild_estimate_ballpark: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      reconcile_estimate_from_scope: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      record_assembly_usage: {
        Args: { _assembly_keys: string[] }
        Returns: undefined
      }
      rederive_measurement_quantities: {
        Args: { _project_id: string }
        Returns: Json
      }
      release_copied_estimate_pricing: {
        Args: { _estimate_id: string }
        Returns: number
      }
      reorder_project_rooms: {
        Args: { _ordered_ids: string[]; _project_id: string }
        Returns: undefined
      }
      reorder_scope_items: {
        Args: { _ordered_ids: string[]; _section_id: string }
        Returns: undefined
      }
      reorder_scope_sections: {
        Args: { _ordered_ids: string[]; _project_id: string }
        Returns: undefined
      }
      repair_estimate_cost_basis: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      repair_estimate_pricing: { Args: { _estimate_id: string }; Returns: Json }
      repair_generic_fallback_residue: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      repair_labor_hours: {
        Args: { _dry_run?: boolean; _estimate_id?: string }
        Returns: {
          action: string
          description: string
          estimate_id: string
          hours_per_unit: number
          line_id: string
          new_hours: number
          old_hours: number
          quantity: number
          reason: string
        }[]
      }
      repair_line_evidence_integrity: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      repair_quantity_evidence: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      repair_task_hours: { Args: { _estimate_id?: string }; Returns: Json }
      reprice_estimate_from_cost_book: {
        Args: { _estimate_id: string }
        Returns: Json
      }
      resync_estimate_scope_quantities: {
        Args: { _estimate_id: string }
        Returns: number
      }
      review_estimate_line_quantity: {
        Args: {
          _description?: string
          _line_id: string
          _quantity?: number
          _unit_key?: Database["public"]["Enums"]["scope_unit"]
        }
        Returns: Json
      }
      round_quarter_hour: { Args: { v: number }; Returns: number }
      save_estimate_ballpark: {
        Args: { _estimate_id: string; _range_snapshot: Json; _session: Json }
        Returns: {
          answers: Json
          assumed_values: Json
          completed_payload: Json | null
          confidence: string | null
          confirmed_values: Json
          contractor_overrides: Json
          created_at: string
          created_by: string
          current_question_id: string | null
          current_stage: string
          derived_geometry: Json
          derived_quantities: Json
          draft_preview: Json | null
          estimate_id: string
          frozen_question_ids: Json
          id: string
          inferred_values: Json
          intake_source: string
          interview_type: string
          organization_id: string
          payload: Json
          photo_analysis: Json
          photo_references: Json
          project_id: string
          range_inputs: Json
          range_snapshot: Json | null
          schema_key: string
          schema_version: number
          transcripts: Json
          unknowns: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "estimate_ballpark_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_estimate_ballpark_session: {
        Args: { _estimate_id: string; _session: Json }
        Returns: {
          answers: Json
          assumed_values: Json
          completed_payload: Json | null
          confidence: string | null
          confirmed_values: Json
          contractor_overrides: Json
          created_at: string
          created_by: string
          current_question_id: string | null
          current_stage: string
          derived_geometry: Json
          derived_quantities: Json
          draft_preview: Json | null
          estimate_id: string
          frozen_question_ids: Json
          id: string
          inferred_values: Json
          intake_source: string
          interview_type: string
          organization_id: string
          payload: Json
          photo_analysis: Json
          photo_references: Json
          project_id: string
          range_inputs: Json
          range_snapshot: Json | null
          schema_key: string
          schema_version: number
          transcripts: Json
          unknowns: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "estimate_ballpark_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_assemblies: {
        Args: {
          _category?: string
          _include_disabled?: boolean
          _limit?: number
          _offset?: number
          _search?: string
          _trade?: string
        }
        Returns: {
          assembly_key: string
          category_key: string
          client_description: string
          code_reference: string
          crew_size: number
          default_labor_hours: number
          default_overhead_pct: number
          default_scope_description: string
          equipment_requirements: string
          estimated_duration_hours: number
          inspection_notes: string
          internal_notes: string
          is_archived: boolean
          is_customized: boolean
          is_disabled: boolean
          is_favorite: boolean
          is_pinned: boolean
          keywords: string[]
          last_used_at: string
          material_allowance: number
          measurement_method: string
          origin: string
          production_rate: number
          safety_notes: string
          skill_level: string
          subcategory_key: string
          suggested_markup_pct: number
          suggested_profit_pct: number
          trade_key: string
          typical_dependencies: string[]
          unit_key: Database["public"]["Enums"]["scope_unit"]
          use_count: number
          waste_factor: number
          work_item: string
        }[]
      }
      set_estimate_line_manual_pricing: {
        Args: {
          _description?: string
          _equipment_cost?: number
          _labor_hours?: number
          _labor_rate?: number
          _line_id: string
          _material_cost?: number
          _other_cost?: number
          _quantity?: number
          _subcontractor_cost?: number
          _unit_key?: Database["public"]["Enums"]["scope_unit"]
        }
        Returns: Json
      }
      set_estimate_status: {
        Args: {
          _estimate_id: string
          _status: Database["public"]["Enums"]["estimate_status"]
        }
        Returns: undefined
      }
      sync_estimate_from_scope: {
        Args: { _estimate_id: string; _pricing?: Json }
        Returns: number
      }
      tag_estimate_book_sources: {
        Args: { _estimate_id: string }
        Returns: {
          book_source: string
          description: string
          is_book_derived: boolean
          line_id: string
          matched_ref: string
        }[]
      }
      template_matches_project: {
        Args: { _project_type: string; _template_type: string }
        Returns: boolean
      }
    }
    Enums: {
      activity_entity_type:
        | "project"
        | "room"
        | "note"
        | "photo"
        | "document"
        | "scope_section"
        | "scope_item"
        | "scope_template"
      activity_type:
        | "created"
        | "updated"
        | "status_changed"
        | "archived"
        | "restored"
        | "uploaded"
        | "reordered"
        | "applied"
        | "duplicated"
        | "moved"
        | "bulk_updated"
      app_role:
        | "owner"
        | "administrator"
        | "estimator"
        | "sales"
        | "office"
        | "read_only"
      client_status: "active" | "archived"
      contact_method: "email" | "phone" | "sms" | "any"
      document_type:
        | "pdf"
        | "plan"
        | "contract"
        | "permit"
        | "inspection"
        | "survey"
        | "specification"
        | "image"
        | "other"
      estimate_status:
        | "draft"
        | "in_review"
        | "ready"
        | "approved"
        | "sent"
        | "accepted"
        | "declined"
        | "superseded"
      line_resolution_status: "resolved" | "unresolved"
      material_pricing_provider_type: "bigbox_home_depot"
      measurement_system: "imperial" | "metric"
      note_type:
        | "general"
        | "field"
        | "followup"
        | "decision"
        | "issue"
        | "project_description"
      notification_category:
        | "system"
        | "estimate"
        | "proposal"
        | "project"
        | "ai"
      photo_type:
        | "existing"
        | "design"
        | "rendering"
        | "progress"
        | "completed"
        | "damage"
        | "inspiration"
        | "other"
      project_priority: "low" | "normal" | "high" | "urgent"
      project_status:
        | "lead"
        | "site_visit_scheduled"
        | "site_visit_complete"
        | "estimate_in_progress"
        | "estimate_sent"
        | "customer_reviewing"
        | "approved"
        | "scheduled"
        | "construction"
        | "completed"
        | "archived"
      room_status: "active" | "archived"
      room_type:
        | "kitchen"
        | "bathroom"
        | "bedroom"
        | "living_room"
        | "dining_room"
        | "basement"
        | "garage"
        | "exterior"
        | "roof"
        | "addition"
        | "whole_house"
        | "other"
      scope_action:
        | "install"
        | "remove"
        | "replace"
        | "repair"
        | "refinish"
        | "paint"
        | "clean"
        | "relocate"
        | "modify"
        | "build"
        | "inspect"
        | "protect"
        | "supply_only"
        | "labor_only"
        | "other"
      scope_completion:
        | "draft"
        | "ready"
        | "approved"
        | "deferred"
        | "completed"
      scope_confidence:
        | "confirmed"
        | "needs_verification"
        | "assumed"
        | "customer_decision_required"
        | "not_applicable"
      scope_priority: "low" | "normal" | "high" | "urgent"
      scope_unit:
        | "each"
        | "linear_foot"
        | "square_foot"
        | "cubic_foot"
        | "cubic_yard"
        | "sheet"
        | "board_foot"
        | "gallon"
        | "pound"
        | "hour"
        | "day"
        | "allowance"
        | "lump_sum"
        | "other"
      task_cost_basis:
        | "labor_production"
        | "labor_lump_sum"
        | "labor_time_and_material"
        | "material_unit"
        | "material_lump_sum"
        | "equipment"
        | "subcontract"
        | "permit_fee"
        | "other_direct_cost"
        | "allowance"
        | "composite_task"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      activity_entity_type: [
        "project",
        "room",
        "note",
        "photo",
        "document",
        "scope_section",
        "scope_item",
        "scope_template",
      ],
      activity_type: [
        "created",
        "updated",
        "status_changed",
        "archived",
        "restored",
        "uploaded",
        "reordered",
        "applied",
        "duplicated",
        "moved",
        "bulk_updated",
      ],
      app_role: [
        "owner",
        "administrator",
        "estimator",
        "sales",
        "office",
        "read_only",
      ],
      client_status: ["active", "archived"],
      contact_method: ["email", "phone", "sms", "any"],
      document_type: [
        "pdf",
        "plan",
        "contract",
        "permit",
        "inspection",
        "survey",
        "specification",
        "image",
        "other",
      ],
      estimate_status: [
        "draft",
        "in_review",
        "ready",
        "approved",
        "sent",
        "accepted",
        "declined",
        "superseded",
      ],
      line_resolution_status: ["resolved", "unresolved"],
      material_pricing_provider_type: ["bigbox_home_depot"],
      measurement_system: ["imperial", "metric"],
      note_type: [
        "general",
        "field",
        "followup",
        "decision",
        "issue",
        "project_description",
      ],
      notification_category: [
        "system",
        "estimate",
        "proposal",
        "project",
        "ai",
      ],
      photo_type: [
        "existing",
        "design",
        "rendering",
        "progress",
        "completed",
        "damage",
        "inspiration",
        "other",
      ],
      project_priority: ["low", "normal", "high", "urgent"],
      project_status: [
        "lead",
        "site_visit_scheduled",
        "site_visit_complete",
        "estimate_in_progress",
        "estimate_sent",
        "customer_reviewing",
        "approved",
        "scheduled",
        "construction",
        "completed",
        "archived",
      ],
      room_status: ["active", "archived"],
      room_type: [
        "kitchen",
        "bathroom",
        "bedroom",
        "living_room",
        "dining_room",
        "basement",
        "garage",
        "exterior",
        "roof",
        "addition",
        "whole_house",
        "other",
      ],
      scope_action: [
        "install",
        "remove",
        "replace",
        "repair",
        "refinish",
        "paint",
        "clean",
        "relocate",
        "modify",
        "build",
        "inspect",
        "protect",
        "supply_only",
        "labor_only",
        "other",
      ],
      scope_completion: ["draft", "ready", "approved", "deferred", "completed"],
      scope_confidence: [
        "confirmed",
        "needs_verification",
        "assumed",
        "customer_decision_required",
        "not_applicable",
      ],
      scope_priority: ["low", "normal", "high", "urgent"],
      scope_unit: [
        "each",
        "linear_foot",
        "square_foot",
        "cubic_foot",
        "cubic_yard",
        "sheet",
        "board_foot",
        "gallon",
        "pound",
        "hour",
        "day",
        "allowance",
        "lump_sum",
        "other",
      ],
      task_cost_basis: [
        "labor_production",
        "labor_lump_sum",
        "labor_time_and_material",
        "material_unit",
        "material_lump_sum",
        "equipment",
        "subcontract",
        "permit_fee",
        "other_direct_cost",
        "allowance",
        "composite_task",
      ],
    },
  },
} as const
