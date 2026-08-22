const NON_PRODUCTION_LABEL =
  /(?:^|[\s[({_-])(uat|test|testing|staging|demo|seed|mock|dummy)(?=$|[\s\])}_-])/i;

const containsNonProductionLabel = (...values) =>
  NON_PRODUCTION_LABEL.test(values.map((value) => String(value || "")).join(" "));

/** Internal/test-labelled rows must never be visible on anonymous surfaces. */
export const isPubliclyVisibleGroup = (group) =>
  !containsNonProductionLabel(group?.name, group?.description, group?.next_event_title);

export const isPubliclyVisiblePost = (post) =>
  !containsNonProductionLabel(
    post?.title,
    post?.content,
    post?.category,
    post?.author_name,
  );
