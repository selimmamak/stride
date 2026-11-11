import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { exportData } from "../data/store";
import { BACKUP_MAX_BYTES } from "../data/validation";

/** Open the operating system's save/share sheet. No server receives the backup. */
export async function saveBackup(): Promise<void> {
  const content = exportData();
  const filename = `stride-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "Saving a backup is unavailable on this device. Try again after restarting the app.",
    );
  const file = new File(Paths.cache, filename);
  try {
    await file.write(content);
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "Save your Stride backup",
    });
  } finally {
    if (file.exists) await file.delete();
  }
}

/** Read a file selected by the user; validation and replacement happen in the store. */
export async function pickBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error("No backup was selected.");
  if (asset.size && asset.size > BACKUP_MAX_BYTES)
    throw new Error(
      "That file is too large. Choose a Stride JSON backup smaller than 64 MB.",
    );
  if (Platform.OS === "web") {
    if (!asset.file)
      throw new Error("This browser could not read the selected file.");
    return asset.file.text();
  }
  const file = new File(asset.uri);
  try {
    if (file.size > BACKUP_MAX_BYTES)
      throw new Error("That backup is larger than 64 MB.");
    return await file.text();
  } finally {
    // The picker was asked to create a cache copy. Only remove that copy.
    if (file.uri.startsWith(Paths.cache.uri) && file.exists)
      await file.delete();
  }
}
