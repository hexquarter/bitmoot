import { Link } from "react-router-dom";

export const NotFound = () => {
  return (
    <div className="flex flex flex-col min-h-screen bg-background text-foreground bg-background">
      <header className="border-b border-border/70 sticky top-0 z-30 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col leading-none">
              <span className="font-mono text-sm font-semibold tracking-tight">
                <Link to='/'>BitMoot<span className="text-primary">.</span></Link>
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="text-center justify-center flex items-center flex-col my-auto">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}