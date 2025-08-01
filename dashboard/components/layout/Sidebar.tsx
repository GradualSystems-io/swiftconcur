'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Repo } from '@/lib/supabase/types';
import { cn } from '@/lib/utils';
import {
  Home,
  GitBranch,
  Settings,
  CreditCard,
  BarChart3,
  Shield,
  Plus,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';

interface SidebarProps {
  repos: Pick<Repo, 'id' | 'name'>[];
  className?: string;
  onClose?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  external?: boolean;
}

const mainNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: Home,
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
  },
];

const settingsNavItems: NavItem[] = [
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
  },
  {
    label: 'Billing',
    href: '/billing',
    icon: CreditCard,
  },
];

export function Sidebar({ repos, className, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [isReposExpanded, setIsReposExpanded] = useState(true);
  
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };
  
  const getRepoStatus = (repoId: string) => {
    // In a real app, this would come from the repos data or a separate query
    // For now, we'll simulate status
    const statuses = ['green', 'yellow', 'red'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    return status as 'green' | 'yellow' | 'red';
  };
  
  const StatusIcon = ({ status }: { status: 'green' | 'yellow' | 'red' }) => {
    switch (status) {
      case 'green':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'yellow':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      case 'red':
        return <AlertTriangle className="h-3 w-3 text-red-500" />;
    }
  };
  
  return (
    <div className={cn("flex flex-col h-full bg-background border-r", className)}>
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-6">
        {/* Main Navigation */}
        <div>
          <h2 className="mb-2 px-2 text-lg font-semibold tracking-tight">
            Navigation
          </h2>
          <div className="space-y-1">
            {mainNavItems.map((item) => (
              <Button
                key={item.href}
                variant={isActive(item.href) ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  isActive(item.href) && "bg-secondary text-secondary-foreground"
                )}
                asChild
                onClick={onClose}
              >
                <Link href={item.href}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                  {item.badge && (
                    <Badge variant="secondary" className="ml-auto">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              </Button>
            ))}
          </div>
        </div>
        
        {/* Repositories */}
        <div>
          <div className="flex items-center justify-between mb-2 px-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Repositories
            </h2>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                {repos.length}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsReposExpanded(!isReposExpanded)}
              >
                {isReposExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
          
          {isReposExpanded && (
            <div className="space-y-1">
              {repos.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No repositories found</p>
                  <Button variant="outline" size="sm" className="mt-2" asChild>
                    <Link href="/settings">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Repository
                    </Link>
                  </Button>
                </div>
              ) : (
                repos.map((repo) => {
                  const repoHref = `/r/${repo.id}`;
                  const status = getRepoStatus(repo.id);
                  
                  return (
                    <Button
                      key={repo.id}
                      variant={isActive(repoHref) ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-left",
                        isActive(repoHref) && "bg-secondary text-secondary-foreground"
                      )}
                      asChild
                      onClick={onClose}
                    >
                      <Link href={repoHref}>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <StatusIcon status={status} />
                          <GitBranch className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate text-sm">
                            {repo.name}
                          </span>
                        </div>
                      </Link>
                    </Button>
                  );
                })
              )}
            </div>
          )}
        </div>
        
        {/* Settings */}
        <div>
          <h2 className="mb-2 px-2 text-lg font-semibold tracking-tight">
            Settings
          </h2>
          <div className="space-y-1">
            {settingsNavItems.map((item) => (
              <Button
                key={item.href}
                variant={isActive(item.href) ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  isActive(item.href) && "bg-secondary text-secondary-foreground"
                )}
                asChild
                onClick={onClose}
              >
                <Link href={item.href}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                  {item.badge && (
                    <Badge variant="secondary" className="ml-auto">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </nav>
      
      {/* Footer */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>SwiftConcur CI v1.0.0</span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Secure • Real-time • AI-powered
        </div>
      </div>
    </div>
  );
}