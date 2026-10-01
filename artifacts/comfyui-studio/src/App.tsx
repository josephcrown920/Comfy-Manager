import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import { AccountSessionBoundary } from '@/components/account-session-boundary';
import { AuthLayout } from '@/components/auth-layout';
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
import GpuHub from '@/pages/gpu-hub';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';

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
          <Route path="/gpu-hub" component={GpuHub} />
          <Route path="/assistant" component={Assistant} />
          <Route path="/jobs" component={Jobs} />
          <Route path="/gallery" component={Gallery} />
          <Route path="/models" component={Models} />
          <Route path="/launch" component={Launch} />
          <Route path="/guide" component={Guide} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={Admin} />
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
    <AuthLayout>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthLayout>
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
    <AuthLayout>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthLayout>
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
    colorPrimary: '#b7f54a',
    colorForeground: '#f5f5f5',
    colorMutedForeground: '#beb2cc',
    colorDanger: '#ff453a',
    colorBackground: '#171120',
    colorInput: '#21172d',
    colorInputForeground: '#f5f5f5',
    colorNeutral: '#817a9e',
    fontFamily: "'Outfit', system-ui, sans-serif",
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#171120] border border-[#382649] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-white',
    headerSubtitle: 'text-[#b4afd0]',
    socialButtonsBlockButtonText: 'text-white',
    formFieldLabel: 'text-white',
    footerActionLink: 'text-[#b7f54a]',
    footerActionText: 'text-[#b4afd0]',
    dividerText: 'text-[#b4afd0]',
    identityPreviewEditButton: 'text-[#b7f54a]',
    formFieldSuccessText: 'text-[#32d74b]',
    alertText: 'text-white',
    logoBox: 'h-14',
    logoImage: 'h-12 w-12 rounded-xl',
    socialButtonsBlockButton: 'border-[#2a2250] bg-[#19152f] hover:bg-[#2a2250]',
    formButtonPrimary: 'bg-[#b7f54a] text-black hover:bg-[#c9ff6b]',
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
      <AccountSessionBoundary>
        <Router />
        <Toaster />
      </AccountSessionBoundary>
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
