import React from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, Info, DollarSign, Shield, Zap } from 'lucide-react';
import { useGetNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';

const CATEGORY_ICONS: Record<string, any> = {
  financial: DollarSign,
  security: Shield,
  system: Info,
  board: Zap,
};

export default function NotificationsPage() {
  const [filter, setFilter] = React.useState('all');
  const queryClient = useQueryClient();

  const { data } = useGetNotifications({ filter } as any);
  const { mutate: markAllRead } = useMarkAllNotificationsRead({
    mutation: { onSuccess: () => queryClient.invalidateQueries() }
  });
  const { mutate: markRead } = useMarkNotificationRead({
    mutation: { onSuccess: () => queryClient.invalidateQueries() }
  });

  const notifications = data?.notifications || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Notifications</h1>
            <p className="text-muted-foreground mt-1">
              {data?.unreadCount || 0} non lue{(data?.unreadCount || 0) > 1 ? 's' : ''}
            </p>
          </div>
          {(data?.unreadCount || 0) > 0 && (
            <button
              onClick={() => markAllRead()}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <CheckCheck className="w-4 h-4" /> Tout marquer lu
            </button>
          )}
        </motion.div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {['all', 'unread', 'financial', 'security'].map(f => (
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
          {notifications.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucune notification</p>
            </div>
          )}
          {notifications.map((n: any, idx: number) => {
            const Icon = CATEGORY_ICONS[n.category] || Bell;
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
                onClick={() => !n.read && markRead({ id: n.id })}
                className={`flex items-start gap-4 rounded-2xl px-5 py-4 transition-all cursor-pointer ${n.read ? 'bg-card/30 border border-border/30' : 'bg-card/60 border border-border shadow-sm hover:border-primary/30'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.read ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>{n.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 mt-2 animate-pulse" />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
