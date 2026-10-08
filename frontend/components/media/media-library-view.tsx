"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  File,
  FileText,
  Folder,
  Grid,
  HardDrive,
  Image as ImageIcon,
  Layers,
  List,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Video,
  Eye,
  Building,
} from "lucide-react";
import {
  bulkDeleteAdminMedia,
  bulkDeleteOrgMedia,
  createAdminMediaUploadUrl,
  createOrgMediaUploadUrl,
  deleteAdminMedia,
  deleteOrgMedia,
  getAdminMedia,
  getAdminMediaStats,
  getOrgMedia,
  getOrgMediaStats,
  registerAdminMedia,
  registerOrgMedia,
  updateAdminMedia,
  updateOrgMedia,
} from "@/lib/api";
import type { MediaFileItem, MediaStatsResponse } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface MediaLibraryViewProps {
  mode: "org" | "admin";
}

export function MediaLibraryView({ mode }: MediaLibraryViewProps) {
  const { toast: addToast } = useToast();
  const [items, setItems] = useState<MediaFileItem[]>([]);
  const [stats, setStats] = useState<MediaStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [selectedOrgId, setSelectedOrgId] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Selection & Detail
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeItem, setActiveItem] = useState<MediaFileItem | null>(null);
  const [editItem, setEditItem] = useState<MediaFileItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editTags, setEditTags] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Upload Modal / Dropzone
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFolder, setUploadFolder] = useState("general");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "org") {
        const [res, statsRes] = await Promise.all([
          getOrgMedia({
            search,
            category: category !== "all" ? category : undefined,
            folder: selectedFolder !== "all" ? selectedFolder : undefined,
            page,
            limit: 24,
          }),
          getOrgMediaStats(),
        ]);
        setItems(res.items);
        setTotalPages(res.meta.totalPages);
        setTotalCount(res.meta.total);
        setStats(statsRes);
      } else {
        const [res, statsRes] = await Promise.all([
          getAdminMedia({
            orgId: selectedOrgId !== "all" ? selectedOrgId : undefined,
            search,
            category: category !== "all" ? category : undefined,
            folder: selectedFolder !== "all" ? selectedFolder : undefined,
            page,
            limit: 24,
          }),
          getAdminMediaStats(),
        ]);
        setItems(res.items);
        setTotalPages(res.meta.totalPages);
        setTotalCount(res.meta.total);
        setStats(statsRes);
      }
    } catch (err) {
      addToast({
        title: "Error loading media library",
        description: err instanceof Error ? err.message : "Failed to load files",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [mode, search, category, selectedFolder, selectedOrgId, page, addToast]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    addToast({ title: "Copied to clipboard!", description: url });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);

    const fileList = Array.from(files);
    let successCount = 0;

    const createUploadUrlFn = mode === "org" ? createOrgMediaUploadUrl : createAdminMediaUploadUrl;
    const registerMediaFn = mode === "org" ? registerOrgMedia : registerAdminMedia;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const { uploadUrl, publicUrl, key, category: fileCat } = await createUploadUrlFn({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          folder: uploadFolder || "general",
        });

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload failed (${uploadRes.status})`);
        }

        await registerMediaFn({
          name: file.name,
          filename: file.name,
          storedKey: key,
          publicUrl,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          category: fileCat,
          folder: uploadFolder || "general",
        });

        successCount++;
        setUploadProgress(Math.round(((i + 1) / fileList.length) * 100));
      } catch (err) {
        addToast({
          title: `Upload failed: ${file.name}`,
          description: err instanceof Error ? err.message : "Failed to upload file",
          variant: "destructive",
        });
      }
    }

    setUploading(false);
    setUploadProgress(null);
    setShowUploadModal(false);

    if (successCount > 0) {
      addToast({
        title: "Upload complete",
        description: `Successfully uploaded ${successCount} file(s) to Media Library.`,
      });
      fetchMedia();
    }
  };

  // Delete confirmation — one file or the current selection.
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "one"; id: string } | { kind: "bulk" } | null
  >(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      if (pendingDelete.kind === "one") await deleteOne(pendingDelete.id);
      else await deleteSelected();
    } finally {
      setDeleteBusy(false);
      setPendingDelete(null);
    }
  };

  const handleDelete = (id: string) => setPendingDelete({ kind: "one", id });

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setPendingDelete({ kind: "bulk" });
  };

  const deleteOne = async (id: string) => {
    try {
      if (mode === "org") {
        await deleteOrgMedia(id);
      } else {
        await deleteAdminMedia(id);
      }
      addToast({ title: "File deleted successfully" });
      if (activeItem?.id === id) setActiveItem(null);
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      fetchMedia();
    } catch (err) {
      addToast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete file",
        variant: "destructive",
      });
    }
  };

  const deleteSelected = async () => {
    try {
      if (mode === "org") {
        await bulkDeleteOrgMedia(selectedIds);
      } else {
        await bulkDeleteAdminMedia(selectedIds);
      }
      addToast({
        title: "Bulk delete successful",
        description: `Deleted ${selectedIds.length} file(s).`,
      });
      setSelectedIds([]);
      fetchMedia();
    } catch (err) {
      addToast({
        title: "Bulk delete failed",
        description: err instanceof Error ? err.message : "Failed to delete files",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (item: MediaFileItem) => {
    setEditItem(item);
    setEditName(item.name);
    setEditFolder(item.folder || "general");
    setEditAlt(item.alt || "");
    setEditTags((item.tags || []).join(", "));
  };

  const hasUnsavedEdit = editItem ? (
    editName !== editItem.name ||
    editFolder !== (editItem.folder || "general") ||
    editAlt !== (editItem.alt || "") ||
    editTags !== (editItem.tags || []).join(", ")
  ) : false;

  const closeEditModal = () => {
    if (hasUnsavedEdit) {
      const confirmClose = window.confirm(
        "You have unsaved changes. Are you sure you want to discard your changes?"
      );
      if (!confirmClose) return;
    }
    setEditItem(null);
  };

  useEffect(() => {
    if (!hasUnsavedEdit) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedEdit]);

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSavingEdit(true);
    try {
      const tagsArray = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (mode === "org") {
        await updateOrgMedia(editItem.id, {
          name: editName,
          folder: editFolder,
          alt: editAlt,
          tags: tagsArray,
        });
      } else {
        await updateAdminMedia(editItem.id, {
          name: editName,
          folder: editFolder,
          alt: editAlt,
          tags: tagsArray,
        });
      }

      addToast({ title: "Media item updated" });
      setEditItem(null);
      fetchMedia();
    } catch (err) {
      addToast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Failed to update item",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((i) => i.id));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const renderFileIcon = (cat: string, mime: string) => {
    if (cat === "image" || mime.startsWith("image/"))
      return <ImageIcon size={22} className="text-blue-500" />;
    if (cat === "video" || mime.startsWith("video/"))
      return <Video size={22} className="text-purple-500" />;
    if (cat === "icon" || cat === "logo")
      return <Sparkles size={22} className="text-amber-500" />;
    if (mime.includes("pdf")) return <FileText size={22} className="text-rose-500" />;
    return <File size={22} className="text-emerald-500" />;
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1600px", margin: "0 auto" }}>
      {/* --- Page Header & Stats Summary --- */}
      <div style={{ marginBottom: "28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: "800",
                letterSpacing: "-0.5px",
                color: "var(--ps-ink, #0f172a)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <HardDrive style={{ color: "var(--ps-primary, #2563eb)" }} size={28} />
              {mode === "admin" ? "Platform Media Console" : "Organisation Media Library"}
            </h1>
            <p style={{ fontSize: "14px", color: "var(--ps-muted, #64748b)", marginTop: "4px" }}>
              {mode === "admin"
                ? "Central repository of all media assets across organisations"
                : "Manage and organise images, documents, videos & branding assets"}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 16px",
                  borderRadius: "10px",
                  background: "#fef2f2",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                  fontWeight: 600,
                  fontSize: "13.5px",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={16} /> Delete Selected ({selectedIds.length})
              </button>
            )}

            {mode === "org" && (
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 18px",
                  borderRadius: "10px",
                  background: "var(--ps-primary, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "13.5px",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
                }}
              >
                <Plus size={18} /> Upload Assets
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            <div
              style={{
                background: "var(--ps-panel-raised, #ffffff)",
                border: "1px solid var(--ps-line-strong, #e2e8f0)",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--ps-muted, #64748b)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Total Files
              </div>
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 800,
                  color: "var(--ps-ink, #0f172a)",
                  marginTop: "6px",
                }}
              >
                {stats.totalFiles.toLocaleString()}
              </div>
            </div>

            <div
              style={{
                background: "var(--ps-panel-raised, #ffffff)",
                border: "1px solid var(--ps-line-strong, #e2e8f0)",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--ps-muted, #64748b)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Storage Used
              </div>
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 800,
                  color: "#2563eb",
                  marginTop: "6px",
                }}
              >
                {stats.totalFormatted}
              </div>
            </div>

            <div
              style={{
                background: "var(--ps-panel-raised, #ffffff)",
                border: "1px solid var(--ps-line-strong, #e2e8f0)",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--ps-muted, #64748b)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Images
              </div>
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 800,
                  color: "var(--ps-ink, #0f172a)",
                  marginTop: "6px",
                }}
              >
                {stats.categoryBreakdown["image"]?.count || 0}
              </div>
            </div>

            <div
              style={{
                background: "var(--ps-panel-raised, #ffffff)",
                border: "1px solid var(--ps-line-strong, #e2e8f0)",
                borderRadius: "14px",
                padding: "16px 20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--ps-muted, #64748b)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Documents
              </div>
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 800,
                  color: "var(--ps-ink, #0f172a)",
                  marginTop: "6px",
                }}
              >
                {stats.categoryBreakdown["document"]?.count || 0}
              </div>
            </div>

            {mode === "admin" && stats.totalOrgs !== undefined && (
              <div
                style={{
                  background: "var(--ps-panel-raised, #ffffff)",
                  border: "1px solid var(--ps-line-strong, #e2e8f0)",
                  borderRadius: "14px",
                  padding: "16px 20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--ps-muted, #64748b)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Active Orgs
                </div>
                <div
                  style={{
                    fontSize: "26px",
                    fontWeight: 800,
                    color: "#9333ea",
                    marginTop: "6px",
                  }}
                >
                  {stats.totalOrgs}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- Toolbar / Filters --- */}
      <div
        style={{
          background: "var(--ps-panel-raised, #ffffff)",
          border: "1px solid var(--ps-line-strong, #e2e8f0)",
          borderRadius: "16px",
          padding: "14px 18px",
          marginBottom: "20px",
          display: "flex",
          flexWrap: "wrap",
          gap: "14px",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
        }}
      >
        {/* Category Tabs */}
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
          {[
            { id: "all", label: "All Assets", icon: Layers },
            { id: "image", label: "Images", icon: ImageIcon },
            { id: "document", label: "Documents", icon: FileText },
            { id: "video", label: "Videos", icon: Video },
            { id: "icon", label: "Icons & Logos", icon: Sparkles },
          ].map((cat) => {
            const IconComp = cat.icon;
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategory(cat.id);
                  setPage(1);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--ps-primary, #2563eb)" : "var(--ps-muted, #64748b)",
                  background: active ? "#eff6ff" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <IconComp size={15} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Right Search & Controls */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Folder Select */}
          {stats?.folders && stats.folders.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Folder size={15} style={{ color: "var(--ps-muted, #64748b)" }} />
              <select
                value={selectedFolder}
                onChange={(e) => {
                  setSelectedFolder(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: "7px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--ps-line-strong, #cbd5e1)",
                  fontSize: "13px",
                  background: "#fff",
                  color: "var(--ps-ink, #0f172a)",
                  outline: "none",
                }}
              >
                <option value="all">All Folders</option>
                {stats.folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Box */}
          <div style={{ position: "relative", width: "220px" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--ps-muted, #94a3b8)",
              }}
            />
            <input
              type="text"
              placeholder="Search filename or tag..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                width: "100%",
                paddingLeft: "32px",
                paddingRight: "10px",
                paddingTop: "7px",
                paddingBottom: "7px",
                borderRadius: "8px",
                border: "1px solid var(--ps-line-strong, #cbd5e1)",
                fontSize: "13px",
                outline: "none",
                background: "#fff",
              }}
            />
          </div>

          {/* View Toggle */}
          <div
            style={{
              display: "flex",
              border: "1px solid var(--ps-line-strong, #cbd5e1)",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              style={{
                padding: "6px 10px",
                background: viewMode === "grid" ? "#f1f5f9" : "#fff",
                border: "none",
                color: viewMode === "grid" ? "#0f172a" : "#94a3b8",
                cursor: "pointer",
              }}
              title="Grid View"
            >
              <Grid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              style={{
                padding: "6px 10px",
                background: viewMode === "list" ? "#f1f5f9" : "#fff",
                border: "none",
                color: viewMode === "list" ? "#0f172a" : "#94a3b8",
                cursor: "pointer",
              }}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* --- Media Items Grid / List --- */}
      {loading ? (
        <div
          style={{
            padding: "80px 0",
            textAlign: "center",
            color: "var(--ps-muted, #64748b)",
          }}
        >
          Loading Media Assets...
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            background: "var(--ps-panel-raised, #ffffff)",
            border: "2px dashed var(--ps-line-strong, #cbd5e1)",
            borderRadius: "16px",
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <HardDrive size={42} style={{ color: "#94a3b8", margin: "0 auto 12px" }} />
          <h3 style={{ fontSize: "17px", fontWeight: "700", color: "var(--ps-ink, #0f172a)" }}>
            No Media Assets Found
          </h3>
          <p style={{ fontSize: "14px", color: "var(--ps-muted, #64748b)", marginTop: "4px" }}>
            {search
              ? `No files matching "${search}"`
              : "Upload your first file to your Media Library"}
          </p>

          {mode === "org" && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              style={{
                marginTop: "16px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                borderRadius: "10px",
                background: "var(--ps-primary, #2563eb)",
                color: "#ffffff",
                border: "none",
                fontWeight: 700,
                fontSize: "13.5px",
                cursor: "pointer",
              }}
            >
              <Plus size={16} /> Upload Now
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "18px",
          }}
        >
          {items.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const isImage = item.category === "image" || item.mimeType.startsWith("image/");
            return (
              <div
                key={item.id}
                style={{
                  background: "var(--ps-panel-raised, #ffffff)",
                  border: isSelected
                    ? "2px solid #2563eb"
                    : "1px solid var(--ps-line-strong, #e2e8f0)",
                  borderRadius: "14px",
                  overflow: "hidden",
                  transition: "all 0.15s ease",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                  position: "relative",
                }}
              >
                {/* Select Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelectItem(item.id)}
                  style={{
                    position: "absolute",
                    top: "10px",
                    left: "10px",
                    zIndex: 10,
                    width: "16px",
                    height: "16px",
                    cursor: "pointer",
                  }}
                />

                {/* Media Preview Area */}
                <div
                  onClick={() => setActiveItem(item)}
                  style={{
                    height: "140px",
                    background: "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.publicUrl}
                      alt={item.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: "center" }}>
                      {renderFileIcon(item.category, item.mimeType)}
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--ps-muted, #64748b)",
                          marginTop: "6px",
                          textTransform: "uppercase",
                        }}
                      >
                        {item.category}
                      </div>
                    </div>
                  )}

                  {/* Folder Tag Badge */}
                  <span
                    style={{
                      position: "absolute",
                      bottom: "8px",
                      right: "8px",
                      background: "rgba(15, 23, 42, 0.75)",
                      color: "#fff",
                      fontSize: "10.5px",
                      fontWeight: 600,
                      padding: "2px 7px",
                      borderRadius: "6px",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    {item.folder || "general"}
                  </span>
                </div>

                {/* Item Details Footer */}
                <div style={{ padding: "12px 14px" }}>
                  <div
                    title={item.name}
                    style={{
                      fontSize: "13.5px",
                      fontWeight: 700,
                      color: "var(--ps-ink, #0f172a)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.name}
                  </div>

                  {mode === "admin" && item.organisation && (
                    <div
                      style={{
                        fontSize: "11.5px",
                        color: "#6366f1",
                        fontWeight: 600,
                        marginTop: "2px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Building size={12} /> {item.organisation.name}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "11.5px",
                      color: "var(--ps-muted, #64748b)",
                      marginTop: "6px",
                    }}
                  >
                    <span>{formatBytes(item.size)}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>

                  {/* Action Buttons */}
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      marginTop: "10px",
                      paddingTop: "8px",
                      borderTop: "1px solid #f1f5f9",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(item.publicUrl, item.id)}
                      style={{
                        flex: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        padding: "5px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                        color: copiedId === item.id ? "#16a34a" : "#334155",
                      }}
                      title="Copy Link"
                    >
                      {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === item.id ? "Copied" : "Copy"}
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      style={{
                        padding: "5px 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        cursor: "pointer",
                        color: "#334155",
                      }}
                      title="Edit Metadata"
                    >
                      <Edit2 size={13} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      style={{
                        padding: "5px 8px",
                        borderRadius: "6px",
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        cursor: "pointer",
                        color: "#dc2626",
                      }}
                      title="Delete Asset"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div
          style={{
            background: "var(--ps-panel-raised, #ffffff)",
            border: "1px solid var(--ps-line-strong, #e2e8f0)",
            borderRadius: "14px",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr
                style={{
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--ps-muted, #64748b)",
                  textTransform: "uppercase",
                }}
              >
                <th style={{ padding: "12px 16px", width: "40px" }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.length === items.length && items.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th style={{ padding: "12px 16px" }}>Asset</th>
                <th style={{ padding: "12px 16px" }}>Category</th>
                <th style={{ padding: "12px 16px" }}>Folder</th>
                {mode === "admin" && <th style={{ padding: "12px 16px" }}>Organisation</th>}
                <th style={{ padding: "12px 16px" }}>Size</th>
                <th style={{ padding: "12px 16px" }}>Date Uploaded</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const isImage = item.category === "image" || item.mimeType.startsWith("image/");
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: isSelected ? "#eff6ff" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectItem(item.id)}
                      />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          cursor: "pointer",
                        }}
                        onClick={() => setActiveItem(item)}
                      >
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "8px",
                            background: "#f1f5f9",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.publicUrl}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            renderFileIcon(item.category, item.mimeType)
                          )}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "13.5px",
                              fontWeight: 700,
                              color: "var(--ps-ink, #0f172a)",
                            }}
                          >
                            {item.name}
                          </div>
                          <div style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                            {item.filename}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          fontSize: "11.5px",
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background: "#e0f2fe",
                          color: "#0369a1",
                          textTransform: "capitalize",
                        }}
                      >
                        {item.category}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#475569" }}>
                      {item.folder || "general"}
                    </td>
                    {mode === "admin" && (
                      <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#6366f1" }}>
                        {item.organisation?.name || "Platform"}
                      </td>
                    )}
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#475569" }}>
                      {formatBytes(item.size)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#64748b" }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => handleCopyUrl(item.publicUrl, item.id)}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#fff",
                            cursor: "pointer",
                          }}
                          title="Copy Link"
                        >
                          {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#fff",
                            cursor: "pointer",
                          }}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            border: "1px solid #fecaca",
                            background: "#fef2f2",
                            color: "#dc2626",
                            cursor: "pointer",
                          }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Pagination Controls --- */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "20px",
            fontSize: "13px",
            color: "var(--ps-muted, #64748b)",
          }}
        >
          <div>
            Showing Page {page} of {totalPages} ({totalCount} assets)
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                cursor: page === 1 ? "default" : "pointer",
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                cursor: page === totalPages ? "default" : "pointer",
                opacity: page === totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* --- Asset Detail Lightbox Modal --- */}
      {activeItem && (
        <Modal open onClose={() => setActiveItem(null)} title={activeItem.name} size="xl" flush>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 320px",
                minHeight: 0,
              }}
            >
              {/* Media Preview */}
              <div
                style={{
                  background: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px",
                  overflow: "hidden",
                }}
              >
                {activeItem.category === "image" || activeItem.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeItem.publicUrl}
                    alt={activeItem.name}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "60vh",
                      objectFit: "contain",
                      borderRadius: "8px",
                    }}
                  />
                ) : activeItem.category === "video" || activeItem.mimeType.startsWith("video/") ? (
                  <video
                    controls
                    src={activeItem.publicUrl}
                    style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: "8px" }}
                  />
                ) : (
                  <div style={{ textAlign: "center", color: "#fff" }}>
                    {renderFileIcon(activeItem.category, activeItem.mimeType)}
                    <div style={{ marginTop: "12px", fontSize: "15px", fontWeight: "600" }}>
                      {activeItem.filename}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar Info */}
              <div
                style={{
                  padding: "24px",
                  borderLeft: "1px solid #e2e8f0",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  fontSize: "13px",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: "#64748b", fontSize: "11px", textTransform: "uppercase" }}>
                    Public Asset URL
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                    <input
                      type="text"
                      readOnly
                      value={activeItem.publicUrl}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(activeItem.publicUrl, activeItem.id)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "none",
                        background: "#2563eb",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: 700, color: "#64748b", fontSize: "11px", textTransform: "uppercase" }}>
                    Asset Details
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                    <div>
                      <strong>Original Filename:</strong>{" "}
                      <span style={{ wordBreak: "break-all" }}>{activeItem.filename}</span>
                    </div>
                    <div>
                      <strong>Alt Text:</strong> {activeItem.alt ? <em>{activeItem.alt}</em> : <span style={{ color: "#94a3b8" }}>Not set</span>}
                    </div>
                    <div>
                      <strong>Size:</strong> {formatBytes(activeItem.size)}
                    </div>
                    <div>
                      <strong>Type (MIME):</strong> {activeItem.mimeType}
                    </div>
                    <div>
                      <strong>Category:</strong> <span style={{ textTransform: "capitalize" }}>{activeItem.category}</span>
                    </div>
                    <div>
                      <strong>Folder:</strong> {activeItem.folder || "general"}
                    </div>
                    <div>
                      <strong>Storage Path:</strong>{" "}
                      <code style={{ fontSize: "11px", background: "#f1f5f9", padding: "2px 5px", borderRadius: "4px", wordBreak: "break-all" }}>
                        {activeItem.storedKey}
                      </code>
                    </div>
                    <div>
                      <strong>Uploaded Date:</strong> {new Date(activeItem.createdAt).toLocaleString()}
                    </div>
                    {activeItem.uploadedBy && (
                      <div>
                        <strong>Uploaded By:</strong> {activeItem.uploadedBy.firstName || activeItem.uploadedBy.email}
                      </div>
                    )}
                    {activeItem.organisation && (
                      <div>
                        <strong>Organisation:</strong> {activeItem.organisation.name}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: "auto", display: "flex", gap: "8px" }}>
                  <a
                    href={activeItem.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "9px",
                      borderRadius: "8px",
                      background: "#f1f5f9",
                      color: "#0f172a",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={14} /> Open Link
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(activeItem.id)}
                    style={{
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#dc2626",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
        </Modal>
      )}

      {/* --- Edit Metadata Modal --- */}
      {editItem && (
        <Modal
          open
          onClose={closeEditModal}
          title="Edit Asset Details"
          size="sm"
          closeDisabled={savingEdit}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={closeEditModal} disabled={savingEdit}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={savingEdit} onClick={handleSaveEdit}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </>
          }
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>Asset Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13.5px",
                    marginTop: "4px",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>Folder Name</label>
                <input
                  type="text"
                  value={editFolder}
                  onChange={(e) => setEditFolder(e.target.value)}
                  placeholder="e.g. Logos, Projects, Floorplans"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13.5px",
                    marginTop: "4px",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>Alt Text / Image Description (SEO)</label>
                <input
                  type="text"
                  value={editAlt}
                  onChange={(e) => setEditAlt(e.target.value)}
                  placeholder="Describe image for SEO and screen readers..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13.5px",
                    marginTop: "4px",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="e.g. hero, banner, brochure"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13.5px",
                    marginTop: "4px",
                  }}
                />
              </div>
            </div>
        </Modal>
      )}

      {/* --- Upload Modal / Drag and Drop Zone --- */}
      {showUploadModal && (
        <Modal open onClose={() => setShowUploadModal(false)} title="Upload Assets to Media Library" size="md">
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>Folder Category</label>
              <input
                type="text"
                value={uploadFolder}
                onChange={(e) => setUploadFolder(e.target.value)}
                placeholder="e.g. general, branding, projects, floorplans"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  marginTop: "4px",
                }}
              />
            </div>

            {/* Drag & Drop Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleUploadFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: isDragging ? "2px dashed #2563eb" : "2px dashed #cbd5e1",
                background: isDragging ? "#eff6ff" : "#f8fafc",
                borderRadius: "14px",
                padding: "36px 20px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Upload size={36} style={{ color: "#2563eb", margin: "0 auto 12px" }} />
              <div style={{ fontSize: "14.5px", fontWeight: "700", color: "#0f172a" }}>
                Click to browse or drag and drop files here
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                Supports Images, Videos, PDFs, Documents & Audio (Up to 100MB per file)
              </div>

              {uploading && uploadProgress !== null && (
                <div style={{ marginTop: "20px" }}>
                  <div
                    style={{
                      height: "6px",
                      width: "100%",
                      background: "#e2e8f0",
                      borderRadius: "3px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${uploadProgress}%`,
                        background: "#2563eb",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#2563eb", marginTop: "6px" }}>
                    Uploading... {uploadProgress}%
                  </div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) handleUploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
        </Modal>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title={pendingDelete?.kind === "bulk" ? "Delete selected files?" : "Delete this file?"}
        message={
          pendingDelete?.kind === "bulk"
            ? `${selectedIds.length} selected file${selectedIds.length === 1 ? "" : "s"} will be permanently deleted. This cannot be undone.`
            : "This media file will be permanently deleted. This cannot be undone."
        }
        confirmLabel="Delete"
        destructive
        busy={deleteBusy}
        onConfirm={() => void confirmPendingDelete()}
        onClose={() => setPendingDelete(null)}
        // Sits above the asset detail modal (z-index 200), which can trigger a delete.
        containerClassName="z-[210]!"
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
