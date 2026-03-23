import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, Info, DollarSign, Shield, Zap, ExternalLink, LucideIcon } from 'lucide-react';
import { useGetNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from '@workspace/api-client-react';
import type { GetNotificationsFilter, Notification } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  financial: DollarSign,
  security: Shield,
  system: Info,
  board: Zap,
  referral: Zap,
};

type FilterOption = GetNotificationsFilter | 'all';

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const [filter, setFilter] = useState<FilterOption>('all');
  const [page, setPage] = useState(1);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data, isFetching } = useGetNotifications({
    filter: filter === 'all' ? undefined : filter,
    page,
  });

  const { mutate: markAllRead } = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        setAllNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    }
  });

  const { mutate: markRead } = useMarkNotificationRead({
    mutation: {
      onSuccess: (_, vars) => {
        queryClient.invalidateQueries();
        setAllNotifications(prev =>
          prev.map(n => n.id === vars.id ? { ...n, read: true } : n)
        );
      }
    }
  });

  useEffect(() => {
    setAllNotifications([]);
    setPage(1);
    setHasMore(true);
  }, [filter]);

  useEffect(() => {
    if (!data?.notifications) return;
    const incoming = data.notifications as Notification[];
    if (page === 1) {
      setAllNotifications(incoming);
    } else {
      setAllNotifications(prev => {
        const ids = new Set(prev.map(n => n.id));
        return [...prev, ...incoming.filter(n => !ids.has(n.id))];
      });
    }
    setHasMore(incoming.length >= PAGE_SIZE);
    setLoadingMore(false);
  }, [data, page]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || isFetching) return;
    setLoadingMore(true);
    setPage(p => p + 1);
  }, [loadingMore, hasMore, isFetching]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) markRead({ id: n.id });
    if (n.actionUrl) navigate(n.actionUrl);
  };

  const unreadCount = allNotifications.filter(n => !n.read).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Notifications</h1>
            <p className="text-muted-foreground mt-1">
              {data?.unreadCount ?? unreadCount} non lue{(data?.unreadCount ?? unreadCount) > 1 ? 's' : ''}
            </p>
          </div>
          {(data?.unreadCount ?? unreadCount) > 0 && (
            <button
              onClick={() => markAllRead()}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <CheckCheck className="w-4 h-4" /> Tout marquer lu
            </button>
          )}
        </motion.div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'unread', 'financial', 'security'] satisfies FilterOption[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm capitalize font-medium transition-all ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-muted'}`}
            >
              {f === 'all' ? 'Toutes' : f === 'unread' ? 'Non lues' : f === 'financial' ? 'Finance' : 'Sécurité'}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="space-y-2">
          {allNotifications.length === 0 && !isFetching && (
            <div className="text-center py-16 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucune notification</p>
            </div>
          )}
          {allNotifications.map((n: Notification, idx: number) => {
            const Icon = CATEGORY_ICONS[n.category] || Bell;
            const hasAction = Boolean(n.actionUrl);
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                onClick={() => handleNotificationClick(n)}
                className={`flex items-start gap-4 rounded-2xl px-5 py-4 transition-all ${hasAction ? 'cursor-pointer' : n.read ? 'cursor-default' : 'cursor-pointer'} ${n.read ? 'bg-card/30 border border-border/30' : 'bg-card/60 border border-border shadow-sm hover:border-primary/30'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.read ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>{n.title}</p>
                    {hasAction && <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 mt-2 animate-pulse" />
                )}
              </motion.div>
            );
          })}

          {/* Infinite scroll sentinel */}
          <div ref={loaderRef} className="py-4 text-center">
            {loadingMore && (
              <div className="flex justify-center gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
            {!hasMore && allNotifications.length > 0 && (
              <p className="text-xs text-muted-foreground/50">Toutes les notifications chargées</p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
