import { Button } from "@/components/ui/button";
import { useHashLocation } from "wouter/use-hash-location";

export default function NotFound() {
  const [, navigate] = useHashLocation();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground mb-4">Page not found</p>
        <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
      </div>
    </div>
  );
}
