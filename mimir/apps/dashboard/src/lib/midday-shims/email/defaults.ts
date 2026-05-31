export function defaultEmailSubject(teamName: string) {
  return `${teamName} sent you an invoice`;
}

export function defaultEmailHeading(teamName: string) {
  return `Invoice from ${teamName}`;
}

export function defaultEmailBody(teamName: string) {
  return `If you have any questions, just reply to this email.\n\nThanks,\n${teamName}`;
}

export const DEFAULT_EMAIL_BUTTON_TEXT = "View invoice";
