import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme/ThemeContext";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={`size-9 rounded-xl border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 ${className || ""}`}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="size-4 text-amber-400 transition-transform duration-300 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="size-4 text-primary transition-transform duration-300 rotate-0 hover:-rotate-12" />
      )}
    </Button>
  );
}
