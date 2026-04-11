import { ChevronDown, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface ReleaseNotesProps {
  version: string;
  notes: string;
}

interface ParsedNotes {
  added: string[];
  improved: string[];
  fixed: string[];
  removed: string[];
  knownRequirements: string[];
}

function parseReleaseNotes(raw: string): ParsedNotes {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: ParsedNotes = { added: [], improved: [], fixed: [], removed: [], knownRequirements: [] };

  let inKnown = false;
  for (const line of lines) {
    // Skip the title line (e.g. "Gentle Control Room Desktop v0.2.0")
    if (/^gentle control room/i.test(line)) continue;

    if (/^known requirements$/i.test(line)) {
      inKnown = true;
      continue;
    }

    if (inKnown) {
      result.knownRequirements.push(line);
    } else if (line.startsWith("Added ")) {
      result.added.push(line.replace(/^Added\s+/, ""));
    } else if (line.startsWith("Improved ")) {
      result.improved.push(line.replace(/^Improved\s+/, ""));
    } else if (line.startsWith("Fixed ")) {
      result.fixed.push(line.replace(/^Fixed\s+/, ""));
    } else if (line.startsWith("Removed ")) {
      result.removed.push(line.replace(/^Removed\s+/, ""));
    }
  }
  return result;
}

const categoryConfig = {
  added: { label: "Added", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20" },
  improved: { label: "Improved", className: "bg-blue-500/15 text-blue-700 border-blue-500/20" },
  fixed: { label: "Fixed", className: "bg-amber-500/15 text-amber-700 border-amber-500/20" },
  removed: { label: "Removed", className: "bg-red-500/15 text-red-700 border-red-500/20" },
} as const;

const ReleaseNotes = ({ version, notes }: ReleaseNotesProps) => {
  const [open, setOpen] = useState(false);
  const parsed = parseReleaseNotes(notes);

  const sections = (["added", "improved", "fixed", "removed"] as const).filter(
    (key) => parsed[key].length > 0
  );

  if (sections.length === 0 && parsed.knownRequirements.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-elevated">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-5 hover:bg-muted/50 transition-colors text-left">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">
              What's new in v{version}
            </h3>
            <p className="text-xs text-muted-foreground">
              {sections.reduce((sum, key) => sum + parsed[key].length, 0)} changes
              {parsed.knownRequirements.length > 0 && " · Known requirements"}
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-5 pb-5 pt-4 space-y-5">
            {sections.map((key) => {
              const cfg = categoryConfig[key];
              return (
                <div key={key} className="space-y-2">
                  <Badge className={`${cfg.className} text-[10px] font-semibold`}>
                    {cfg.label}
                  </Badge>
                  <ul className="space-y-1.5 ml-1">
                    {parsed[key].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                        <span className="mt-2 w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {parsed.knownRequirements.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-foreground">Known Requirements</p>
                    <ul className="space-y-1">
                      {parsed.knownRequirements.map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default ReleaseNotes;
