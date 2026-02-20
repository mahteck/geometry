"use client";

import ReactMarkdown from "react-markdown";

const articleClass =
  "text-slate-700 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-4 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:w-full [&_table]:my-4 [&_table]:border-collapse [&_table]:text-sm [&_th]:bg-slate-100 [&_th]:border [&_th]:border-slate-300 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre]:text-sm [&_hr]:my-6 [&_hr]:border-slate-200";

export default function DocRenderer({ content }: { content: string }) {
  return (
    <article className={articleClass}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
