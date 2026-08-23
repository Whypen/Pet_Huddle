import type { NativeSocialComment } from "../../lib/nativeSocial";

export type NativeSocialThreadedReply = {
  activeRailColumns: boolean[];
  childRailColumn: number;
  comment: NativeSocialComment;
  depth: number;
  descendantCount: number;
  directChildCount: number;
  hasChildComments: boolean;
  hasVisibleChildComments: boolean;
  isLastSibling: boolean;
  isMaxDepthContinuation: boolean;
  parentRailColumn: number | null;
  visualDepth: number;
};

export function buildNativeReplyTree(
  comments: NativeSocialComment[],
  expandedBranches: Set<string>,
  hiddenIds: Set<string>,
) {
  // Last line of defence: the tree is what React keys off, so an id may appear at
  // most once here no matter what the upstream merges produced.
  const seenIds = new Set<string>();
  const visibleComments = comments.filter((comment) => {
    if (!comment.id || hiddenIds.has(comment.id) || seenIds.has(comment.id)) return false;
    seenIds.add(comment.id);
    return true;
  });
  const visibleIds = new Set(visibleComments.map((comment) => comment.id));
  const childCommentsByParent = new Map<string, NativeSocialComment[]>();
  const topLevelComments: NativeSocialComment[] = [];

  visibleComments.forEach((comment) => {
    const parentId =
      comment.parentCommentId && visibleIds.has(comment.parentCommentId)
        ? comment.parentCommentId
        : null;

    if (!parentId) {
      topLevelComments.push(comment);
      return;
    }

    childCommentsByParent.set(parentId, [...(childCommentsByParent.get(parentId) || []), comment]);
  });

  const collectDescendantIds = (commentId: string): string[] => {
    const children = childCommentsByParent.get(commentId) || [];
    return children.flatMap((child) => [child.id, ...collectDescendantIds(child.id)]);
  };

  const countDescendants = (commentId: string): number => {
    const children = childCommentsByParent.get(commentId) || [];
    return children.reduce((total, child) => total + 1 + countDescendants(child.id), 0);
  };

  const getLastChildId = (commentId: string): string => {
    const children = childCommentsByParent.get(commentId) || [];
    return children.length > 0 ? children[children.length - 1].id : commentId;
  };

  const getLastDescendantId = (commentId: string): string => {
    const children = childCommentsByParent.get(commentId) || [];
    return children.length > 0 ? getLastDescendantId(children[children.length - 1].id) : commentId;
  };

  const flatten = (
    rows: NativeSocialComment[],
    depth = 0,
    activeRailColumns: boolean[] = [],
    parentRailColumn: number | null = null,
    parentVisualDepth: number | null = null,
  ): NativeSocialThreadedReply[] =>
    rows.flatMap((comment, index) => {
      const children = childCommentsByParent.get(comment.id) || [];
      const visualDepth = Math.min(depth, 2);
      const visibleChildren = depth >= 2 || expandedBranches.has(comment.id) ? children : [];
      const isLastSibling = index === rows.length - 1;
      const currentRails = Array.from({ length: 3 }, (_, column) => activeRailColumns[column] === true);
      const childRails = currentRails.slice();

      if (parentRailColumn !== null) childRails[parentRailColumn] = !isLastSibling;
      if (visibleChildren.length > 0) childRails[visualDepth] = true;

      return [
        {
          activeRailColumns: currentRails,
          childRailColumn: visualDepth,
          comment,
          depth,
          descendantCount: countDescendants(comment.id),
          directChildCount: children.length,
          hasChildComments: children.length > 0,
          hasVisibleChildComments: visibleChildren.length > 0,
          isLastSibling,
          isMaxDepthContinuation: visualDepth === 2 && parentVisualDepth === 2,
          parentRailColumn,
          visualDepth,
        },
        ...flatten(visibleChildren, depth + 1, childRails, visualDepth, visualDepth),
      ];
    });

  return {
    childCommentsByParent,
    collectDescendantIds,
    countDescendants,
    getLastChildId,
    getLastDescendantId,
    threadedComments: flatten(topLevelComments),
  };
}
