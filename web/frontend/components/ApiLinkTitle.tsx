interface ApiLinkTitleProps {
  name: string;
  hint: string;
}

/** API 链接标题：主标题 + 下方 90% 字号注释 */
export default function ApiLinkTitle({ name, hint }: ApiLinkTitleProps) {
  return (
    <span className="flex flex-col gap-0.5 leading-snug">
      <span>{name}</span>
      <span className="text-[90%] text-[#787774]">{hint}</span>
    </span>
  );
}
