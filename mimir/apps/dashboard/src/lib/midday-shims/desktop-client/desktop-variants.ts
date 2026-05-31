export default function desktopPlugin() {
  return ({ addVariant }: { addVariant?: (name: string, value: string) => void }) => {
    addVariant?.("desktop", ".desktop &");
  };
}
