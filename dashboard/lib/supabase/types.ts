export type Database = {
  public: {
    Tables: {
      repos: {
        Row: {
          id: string;
          name: string;
          tier: 'free' | 'pro' | 'enterprise';
          created_at: string;
          github_id: number;
          full_name: string;
          is_private: boolean;
          webhook_secret: string | null;
        };
        Insert: Omit<Database['public']['Tables']['repos']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['repos']['Insert']>;
      };
      runs: {
        Row: {
          id: string;
          repo_id: string;
          created_at: string;
          warnings_count: number;
          ai_summary: string | null;
          commit_sha: string;
          branch: string;
          pull_request: number | null;
          scheme: string;
          configuration: string;
          swift_version: string;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          r2_object_key: string | null;
        };
        Insert: Omit<Database['public']['Tables']['repos']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['repos']['Insert']>;
      };
      warnings: {
        Row: {
          id: string;
          run_id: string;
          file_path: string;
          line_number: number;
          column_number: number | null;
          type: 'actor_isolation' | 'sendable' | 'data_race' | 'performance';
          severity: 'critical' | 'high' | 'medium' | 'low';
          message: string;
          code_context: {
            before: string[];
            line: string;
            after: string[];
          };
          suggested_fix: string | null;
        };
        Insert: Omit<Row, 'id'>;
        Update: Partial<Insert>;
      };
      repo_warning_daily: {
        Row: {
          repo_id: string;
          date: string;
          run_count: number;
          total_warnings: number;
          avg_warnings: number;
          critical_warnings: number;
          high_warnings: number;
          medium_warnings: number;
          low_warnings: number;
        };
        Insert: Row;
        Update: Partial<Insert>;
      };
      user_repos: {
        Row: {
          user_id: string;
          repo_id: string;
          role: 'owner' | 'admin' | 'read';
          created_at: string;
        };
        Insert: Omit<Row, 'created_at'>;
        Update: Partial<Insert>;
      };
      api_tokens: {
        Row: {
          id: string;
          repo_id: string;
          token_hash: string;
          name: string;
          last_used_at: string | null;
          created_at: string;
          expires_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['repos']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['repos']['Insert']>;
      };
    };
    Views: {
      repo_stats: {
        Row: {
          repo_id: string;
          total_runs: number;
          total_warnings: number;
          critical_warnings: number;
          high_warnings: number;
          last_run_at: string | null;
          trend_7d: number; // percentage change
          trend_30d: number;
          avg_warnings_per_run: number;
          success_rate: number; // percentage of runs with 0 critical warnings
        };
      };
      user_repo_access: {
        Row: {
          user_id: string;
          repo_id: string;
          repo_name: string;
          repo_tier: 'free' | 'pro' | 'enterprise';
          role: 'owner' | 'admin' | 'read';
          last_run_at: string | null;
          total_warnings: number;
          critical_warnings: number;
        };
      };
    };
    Functions: {
      get_trend_data: {
        Args: {
          repo_id: string;
          days: number;
        };
        Returns: {
          date: string;
          total_warnings: number;
          run_count: number;
          avg_warnings: number;
        }[];
      };
      check_repo_access: {
        Args: {
          user_id: string;
          repo_id: string;
        };
        Returns: {
          has_access: boolean;
          role: string | null;
        };
      };
    };
  };
};

// Type exports for easier use
export type Repo = Database['public']['Tables']['repos']['Row'];
export type Run = Database['public']['Tables']['runs']['Row'];
export type Warning = Database['public']['Tables']['warnings']['Row'];
export type RepoWarningDaily = Database['public']['Tables']['repo_warning_daily']['Row'];
export type UserRepo = Database['public']['Tables']['user_repos']['Row'];
export type ApiToken = Database['public']['Tables']['api_tokens']['Row'];

export type RepoStats = Database['public']['Views']['repo_stats']['Row'];
export type UserRepoAccess = Database['public']['Views']['user_repo_access']['Row'];

// Enhanced types with relations
export type RepoWithStats = Repo & {
  repo_stats?: RepoStats[];
};

export type RunWithWarnings = Run & {
  warnings: Warning[];
  repos?: Pick<Repo, 'name' | 'tier'>;
};

export type WarningWithContext = Warning & {
  run?: Pick<Run, 'commit_sha' | 'branch' | 'created_at'>;
};

// Security and validation types
export type UserRole = 'owner' | 'admin' | 'read';
export type WarningType = 'actor_isolation' | 'sendable' | 'data_race' | 'performance';
export type WarningSeverity = 'critical' | 'high' | 'medium' | 'low';
export type PlanTier = 'free' | 'pro' | 'enterprise';
export type RunStatus = 'pending' | 'processing' | 'completed' | 'failed';

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Chart data types
export interface TrendDataPoint {
  date: string;
  warnings: number;
  runs: number;
  critical: number;
}

export interface WarningBreakdown {
  type: WarningType;
  count: number;
  percentage: number;
}

export interface QualityGateStatus {
  status: 'green' | 'yellow' | 'red';
  score: number;
  criticalCount: number;
  totalCount: number;
  message: string;
}