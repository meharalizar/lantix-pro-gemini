export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-bold">Page Not Found</h2>
      <p className="mt-2 text-sm text-muted-foreground">The requested page could not be found.</p>
      <a href="/" className="mt-4 text-sm text-primary underline">Return Home</a>
    </div>
  )
}
