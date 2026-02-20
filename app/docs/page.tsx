import { readFileSync } from "fs";
import { join } from "path";
import DocRenderer from "./DocRenderer";

const CONTENT_PATH = join(process.cwd(), "content", "system-and-database-guide.md");

export default function DocsPage() {
  let content: string;
  try {
    content = readFileSync(CONTENT_PATH, "utf-8");
  } catch {
    content = "# System & Database Guide\n\nContent file not found. Ensure `content/system-and-database-guide.md` exists.";
  }
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <DocRenderer content={content} />
      </div>
    </div>
  );
}
