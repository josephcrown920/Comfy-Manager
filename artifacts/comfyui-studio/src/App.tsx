import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import NotFound from '@/pages/not-found';
import { Shell } from '@/components/shell';
import Dashboard from '@/pages/dashboard';
import Generate from '@/pages/generate';
import Assistant from '@/pages/assistant';
import Jobs from '@/pages/jobs';
import Gallery from '@/pages/gallery';
import Settings from '@/pages/settings';
import Models from '@/pages/models';
import Launch from '@/pages/launch';
import Guide from '@/pages/guide';
import Batches from '@/pages/batches';
import PerformAnywhere from '@/pages/perform-anywhere';
import PerformAnywhere from '@/pages/perform-anywhere';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/generate" component={Generate} />
          <Route path="/batches" component={Batches} />
          <Route path="/perform-anywhere" component={PerformAnywhere} />
          <Route path="/perform-anywhere" component={PerformAnywhere} />
          <Route path="/assistant" component={Assistant} />
          <Route path="/jobs" component={Jobs} />
          <Route path="/gallery" component={Gallery} />
          <Route path="/models" component={Models} />
          <Route path="/launch" component={Launch} />
          <Route path="/guide" component={Guide} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="comfy-studio-theme">
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
          <Router />
        </WouterRouter>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
