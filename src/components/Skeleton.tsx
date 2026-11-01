// Skeleton bones for in-app waiting states (styles in theme.css §Skeleton).
// A skeleton repeats the geometry of what is coming so the screen develops in
// place instead of swapping a sentence for a table. Keep each use the same
// shape as the loaded content: same columns, same row height, same card.

/** One grey bone. Size it with the style prop; the pulse is in the class. */
export function Bone({ style }: { style?: React.CSSProperties }) {
  return <span className="skel-bone" style={style} aria-hidden="true" />;
}

/**
 * The announced wrapper: screen readers hear the message once, see none of
 * the bones. Visible children are purely decorative.
 */
export function SkeletonStatus({
  message,
  children,
}: {
  message: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p role="status" className="visually-hidden">
        {message}
      </p>
      <div aria-hidden="true">{children}</div>
    </>
  );
}
