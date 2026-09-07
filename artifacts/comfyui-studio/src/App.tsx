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

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route>
          <Shell>
            <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/generate" component={Generate} />
          <Route path="/batches" component={Batches} />
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
          </Shell>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="comfy-studio-theme">
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'top' as const,
  },
  variables: {
    colorPrimary: '#e8f724',
    colorForeground: '#f5f5f5',
    colorMutedForeground: '#b4afd0',
    colorDanger: '#ff453a',
    colorBackground: '#111022',
    colorInput: '#19152f',
    colorInputForeground: '#f5f5f5',
    colorNeutral: '#817a9e',
    fontFamily: "'Outfit', system-ui, sans-serif",
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#111022] border border-[#2a2250] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-white',
    headerSubtitle: 'text-[#b4afd0]',
    socialButtonsBlockButtonText: 'text-white',
    formFieldLabel: 'text-white',
    footerActionLink: 'text-[#e8f724]',
    footerActionText: 'text-[#b4afd0]',
    dividerText: 'text-[#b4afd0]',
    identityPreviewEditButton: 'text-[#e8f724]',
    formFieldSuccessText: 'text-[#32d74b]',
    alertText: 'text-white',
    logoBox: 'h-14',
    logoImage: 'h-12 w-12 rounded-xl',
    socialButtonsBlockButton: 'border-[#2a2250] bg-[#19152f] hover:bg-[#2a2250]',
    formButtonPrimary: 'bg-[#e8f724] text-black hover:bg-[#d4e010]',
    formFieldInput: 'border-[#2a2250] bg-[#19152f] text-white',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#2a2250]',
    alert: 'border-[#2a2250] bg-[#19152f]',
    otpCodeFieldInput: 'border-[#2a2250] bg-[#19152f] text-white',
    formFieldRow: 'text-white',
    main: 'text-white',
  },
};

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      client.clear();
    }
    previousUserId.current = userId;
  }), [addListener, client]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to use the Aurora AI assistant' } },
        signUp: { start: { title: 'Create your account', subtitle: 'Start building with Aurora AI' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Router />
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

// Replit intentionally leaves this empty in development so Clerk talks to its
// development FAPI directly. Publishing injects the production proxy URL
// automatically; keep this unconditional and do not hardcode /api/__clerk.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
