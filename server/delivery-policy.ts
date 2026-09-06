export type DeliveryStatus = "sent" | "delivered" | "read";
export type ReceiptAwareChatType = "direct" | "group" | "channel";

export type ReceiptProgress = {
  total: number;
  delivered: number;
  read: number;
  required: number;
};

export function requiredReceiptCount(
  chatType: ReceiptAwareChatType,
  recipientCount: number,
) {
  if (recipientCount <= 0) return 1;
  if (chatType === "channel") return recipientCount;
  if (chatType === "group") return Math.floor(recipientCount / 2) + 1;
  return 1;
}

export function aggregateDeliveryStatus(
  chatType: ReceiptAwareChatType,
  progress: Omit<ReceiptProgress, "required">,
) {
  const required = requiredReceiptCount(chatType, progress.total);
  const status: DeliveryStatus =
    progress.read >= required
      ? "read"
      : progress.delivered >= required
        ? "delivered"
        : "sent";

  return {
    status,
    progress: { ...progress, required },
  };
}
