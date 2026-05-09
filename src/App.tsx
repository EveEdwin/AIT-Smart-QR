/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from "react";
import { 
  Plus, 
  Folder as FolderIcon, 
  QrCode as QrIcon, 
  Trash2, 
  Edit2, 
  ExternalLink, 
  ChevronRight, 
  MoreHorizontal,
  LogOut,
  Settings,
  Search,
  LayoutGrid,
  Filter,
  Download,
  Copy,
  FolderPlus,
  Scan,
  X,
  Users,
  FileText,
  File,
  Type,
  Link as LinkIcon,
  ArrowLeft,
  FileUp,
  AlertCircle,
  HelpCircle,
  Info
} from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";
import type { User } from "@supabase/supabase-js";
import confetti from 'canvas-confetti';
import { QRCodeSVG } from "qrcode.react";
import { supabase, supabaseStorageBucket } from "./lib/supabase";
import { cn, formatDate, toMillis } from "./lib/utils";
import { motion, AnimatePresence } from "motion/react";

// --- Types ---
interface QRCode {
  id: string;
  name: string;
  targetUrl?: string; // Legacy/Fallback
  type: 'link' | 'text' | 'file';
  content: {
    value: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  };
  slug: string;
  folderId: string | null;
  userId: string;
  managers?: string[];
  createdAt: any;
  updatedAt: any;
  fgColor?: string;
  bgColor?: string;
  visibility?: 'public' | 'restricted';
  allowedEmails?: string[];
}

interface Folder {
  id: string;
  name: string;
  userId: string;
  managers?: string[];
  parentId: string | null;
  createdAt: any;
  updatedAt: any;
}

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-slate-200/50 rounded", className)} />
);

const nowIso = () => new Date().toISOString();

const mergeUniqueById = <T extends { id: string }>(items: T[]) => {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
};

export default function App() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [qrCodesLoading, setQrCodesLoading] = useState(true);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "updatedAt">("updatedAt");
  const [folderSortBy, setFolderSortBy] = useState<"name" | "createdAt" | "updatedAt">("updatedAt");
  const [selectedQrIds, setSelectedQrIds] = useState<string[]>([]);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Modals
  const [isQrModalOpen, setQrModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFolderModalOpen, setFolderModalOpen] = useState(false);
  const [editingQr, setEditingQr] = useState<QRCode | null>(null);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string | string[]; type: 'qr' | 'folder' | 'bulk' } | null>(null);

  // Sharing State
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [sharingQr, setSharingQr] = useState<QRCode | null>(null);
  const [isFolderShareModalOpen, setFolderShareModalOpen] = useState(false);
  const [sharingFolder, setSharingFolder] = useState<Folder | null>(null);
  const [shareVisibility, setShareVisibility] = useState<'public' | 'restricted'>('public');
  const [shareEmails, setShareEmails] = useState<string>("");
  const [folderManagersEmails, setFolderManagersEmails] = useState<string>("");

  // Redirect State
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  const [redirectStatus, setRedirectStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [redirectMessage, setRedirectMessage] = useState("");

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/r/')) {
      const slug = path.split('/r/')[1];
      if (slug) setRedirectPath(slug);
    }
  }, []);

  useEffect(() => {
    if (!redirectPath) return;

    const handleRedirect = async () => {
      try {
        const { data, error } = await supabase
          .from("qrcodes")
          .select("*")
          .eq("slug", redirectPath)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          setRedirectStatus('error');
          setRedirectMessage("The protocol you're looking for does not exist or has been purged.");
          return;
        }

        const qr = data as QRCode;
        
        // Handle direct redirect for links, otherwise show landing page
        if (qr.type === 'link' || (!qr.type && qr.targetUrl)) {
          setRedirectStatus('success');
          window.location.href = qr.content?.value || qr.targetUrl || "";
        } else {
          // It's a file or text, we show the landing page
          setSharingQr(qr); // Reuse sharingQr to store the active redirect QR
          setRedirectStatus('success');
        }
      } catch (err) {
        setRedirectStatus('error');
        setRedirectMessage("An error occurred during decompression of the redirect signal.");
      }
    };

    handleRedirect();
    }, [redirectPath]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    // Keep errors a bit longer
    const duration = type === "error" ? 5000 : 3000;
    setTimeout(() => setToast(null), duration);
  };

  const handleFirestoreError = (err: any, operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write', path: string | null = null) => {
    console.error(`Firestore error during ${operationType}:`, err);
    
    if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
      const errorInfo = {
        error: err.message,
        operationType,
        path,
        authInfo: {
          userId: user?.uid || 'anonymous',
          email: user?.email || '',
          emailVerified: user?.emailVerified || false,
          isAnonymous: user?.isAnonymous || true,
          providerInfo: user?.providerData.map(p => ({
            providerId: p.providerId,
            displayName: p.displayName || '',
            email: p.email || ''
          })) || []
        }
      };
      showToast("Security protocol violation. Action restricted.", "error");
      throw new Error(JSON.stringify(errorInfo));
    }
    
    showToast(err.message || "An unexpected error occurred", "error");
  };

  const isMissingUsersTableError = (err: any) => {
    const message = String(err?.message || err?.msg || "").toLowerCase();
    return (
      message.includes("could not find the table 'public.users'") ||
      message.includes('relation "public.users" does not exist') ||
      (err?.code === "PGRST205" && message.includes("public.users"))
    );
  };

  useEffect(() => {
    if (isScannerOpen) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render((decodedText) => {
        setNewQrContent(decodedText);
        setNewQrType('link'); // Default to link when scanning
        // Try to extract a name from the URL
        try {
          const url = new URL(decodedText);
          const hostname = url.hostname.replace('www.', '');
          if (!newQrName) setNewQrName(hostname.charAt(0).toUpperCase() + hostname.slice(1));
        } catch (e) {
          if (!newQrName) setNewQrName("Scanned Asset");
        }
        
        scanner.clear();
        setIsScannerOpen(false);
      }, (error) => {
        // quiet fail
      });

      return () => {
        scanner.clear();
      };
    }
  }, [isScannerOpen]);

  // New Items State
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB limit
  const ALLOWED_TYPES = ['application/pdf', 'text/csv', 'image/jpeg', 'image/png', 'image/gif', 'video/mp4'];

  const [newQrName, setNewQrName] = useState("");
  const [newQrType, setNewQrType] = useState<'link' | 'text' | 'file'>('link');
  const [newQrContent, setNewQrContent] = useState("");
  const [newQrFile, setNewQrFile] = useState<File | null>(null);
  const [qrFileError, setQrFileError] = useState<string | null>(null);
  const [newQrSlug, setNewQrSlug] = useState("");
  const [newQrFgColor, setNewQrFgColor] = useState("#000000");
  const [newQrBgColor, setNewQrBgColor] = useState("#FFFFFF");
  const [newFolderName, setNewFolderName] = useState("");

  const appUrl = env.VITE_APP_URL ?? window.location.origin;

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;

      if (error) {
        console.error("Auth bootstrap failed", error);
      }

      setUser(data.user ?? null);
      setLoading(false);
    };

    bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setFolders([]);
      setQrCodes([]);
      setProfile(null);
      setFoldersLoading(false);
      setQrCodesLoading(false);
      return;
    }

    let active = true;
    const email = user.email || "";

    const loadFolders = async () => {
      const [ownedFolders, sharedFolders] = await Promise.all([
        supabase.from("folders").select("*").eq("userId", user.id).order("createdAt", { ascending: false }),
        email
          ? supabase.from("folders").select("*").contains("managers", [email]).order("createdAt", { ascending: false })
          : Promise.resolve({ data: [], error: null } as const),
      ]);

      if (!active) return;

      if (ownedFolders.error) throw ownedFolders.error;
      if (sharedFolders.error) throw sharedFolders.error;

      const merged = mergeUniqueById([...(ownedFolders.data || []), ...(sharedFolders.data || [])] as Folder[]);
      setFolders(merged.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)));
      setFoldersLoading(false);
    };

    const loadQrs = async () => {
      const [ownedQrs, sharedQrs] = await Promise.all([
        supabase.from("qrcodes").select("*").eq("userId", user.id).order("updatedAt", { ascending: false }),
        email
          ? supabase.from("qrcodes").select("*").contains("managers", [email]).order("updatedAt", { ascending: false })
          : Promise.resolve({ data: [], error: null } as const),
      ]);

      if (!active) return;

      if (ownedQrs.error) throw ownedQrs.error;
      if (sharedQrs.error) throw sharedQrs.error;

      const merged = mergeUniqueById([...(ownedQrs.data || []), ...(sharedQrs.data || [])] as QRCode[]);
      setQrCodes(merged.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)));
      setQrCodesLoading(false);
    };

    const loadProfile = async () => {
      const fallbackProfile = {
        name: String(user.user_metadata?.name || ""),
        email: user.email || "",
      };

      const { data, error } = await supabase
        .from("users")
        .select("name,email")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        if (isMissingUsersTableError(error)) {
          setProfile(fallbackProfile);
          return;
        }
        throw error;
      }

      setProfile(data ? { name: data.name || "", email: data.email || "" } : fallbackProfile);
    };

    const refresh = async () => {
      setFoldersLoading(true);
      setQrCodesLoading(true);

      try {
        await Promise.all([loadFolders(), loadQrs(), loadProfile()]);
      } catch (error) {
        handleFirestoreError(error, 'list', 'supabase-sync');
        if (active) {
          setFoldersLoading(false);
          setQrCodesLoading(false);
        }
      }
    };

    refresh();

    const foldersChannel = supabase
      .channel(`folders-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folders' }, () => {
        loadFolders().catch((error) => handleFirestoreError(error, 'list', 'folders'));
      })
      .subscribe();

    const qrsChannel = supabase
      .channel(`qrcodes-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qrcodes' }, () => {
        loadQrs().catch((error) => handleFirestoreError(error, 'list', 'qrCodes'));
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(foldersChannel);
      supabase.removeChannel(qrsChannel);
    };
  }, [user]);

  useEffect(() => {
    // Show onboarding for new users
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (user && !hasSeenOnboarding && !loading && qrCodes.length === 0) {
      setOnboardingStep(1);
    }
  }, [user, loading, qrCodes.length]);

  useEffect(() => {
    // Proactive onboarding: Auto-open profile modal if name or email is missing
    if (user && profile && !loading) {
      if (!profile.name || !profile.email) {
        setProfileModalOpen(true);
      }
    }
  }, [user, profile, loading]);

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("users").upsert({
        id: user.id,
        name: editName,
        email: editEmail,
      });

      if (error) {
        if (!isMissingUsersTableError(error)) {
          throw error;
        }

        const { error: metadataError } = await supabase.auth.updateUser({
          data: { name: editName },
        });

        if (metadataError) throw metadataError;

        if (editEmail && editEmail !== user.email) {
          const { error: emailError } = await supabase.auth.updateUser({ email: editEmail });
          if (emailError) {
            showToast("Name updated. Email change requires Supabase Auth email settings.", "error");
          }
        }
      }

      setProfile({ name: editName, email: editEmail });
      showToast("Identity updated successfully");
      setProfileModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${user.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async () => {
    try {
      const email = window.prompt("Enter your email to receive a secure access link:");
      if (!email) return;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: appUrl,
        },
      });

      if (error) throw error;
      showToast("Access link sent. Check your email to continue.");
    } catch (err) {
      console.error("Login failed", err);
      showToast("Login failed. Check your email settings in Supabase.", "error");
    }
  };

  const handleCreateQr = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    try {
      let finalContentValue = newQrContent;
      let fileMeta = {};

      if (newQrType === 'file' && newQrFile) {
        setUploadProgress(0);
        setQrFileError(null);
        try {
          const uploadPath = `${user.id}/${Date.now()}_${newQrFile.name}`;
          const { error: uploadError } = await supabase.storage
            .from(supabaseStorageBucket)
            .upload(uploadPath, newQrFile, {
              upsert: false,
              contentType: newQrFile.type || undefined,
            });

          if (uploadError) {
            setQrFileError(`Upload failed: ${uploadError.message}`);
            throw uploadError;
          }

          const { data } = supabase.storage.from(supabaseStorageBucket).getPublicUrl(uploadPath);

          finalContentValue = data.publicUrl;
          fileMeta = {
            fileName: newQrFile.name,
            fileSize: newQrFile.size,
            mimeType: newQrFile.type
          };
          setUploadProgress(100);
        } catch (err) {
          console.error("Upload error:", err);
          throw new Error("Failed to secure artifact. Please check your connection.");
        } finally {
          setUploadProgress(null);
        }
      }

      const qrData: any = {
        name: newQrName,
        type: newQrType,
        content: {
          value: finalContentValue,
          ...fileMeta
        },
        slug: newQrSlug || Math.random().toString(36).substring(7),
        folderId: activeFolderId,
        fgColor: newQrFgColor,
        bgColor: newQrBgColor,
        visibility: 'public',
        allowedEmails: [],
        userId: user.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      // Compatibility for legacy redirects
      if (newQrType === 'link') {
        qrData.targetUrl = finalContentValue;
      }

      // Inherit managers from folder if exists
      if (activeFolderId) {
        const folder = folders.find(f => f.id === activeFolderId);
        if (folder && folder.managers) {
          qrData.managers = folder.managers;
        }
      }

      if (editingQr) {
        const updateData: any = {
          name: newQrName,
          type: newQrType,
          content: {
            value: finalContentValue,
            ...fileMeta
          },
          folderId: activeFolderId,
          fgColor: newQrFgColor,
          bgColor: newQrBgColor,
          updatedAt: nowIso(),
        };
        if (newQrType === 'link') updateData.targetUrl = finalContentValue;

        const { error } = await supabase.from("qrcodes").update(updateData).eq("id", editingQr.id);
        if (error) throw error;
        showToast("Protocol updated");
      } else {
        const { error } = await supabase.from("qrcodes").insert(qrData);
        if (error) throw error;
        showToast("Artifact deployed");
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#000000', '#3b82f6', '#f8fafc'],
          gravity: 1.2,
          scalar: 0.8
        });
      }

      setQrModalOpen(false);
      setEditingQr(null);
      resetQrFields();
    } catch (err) {
      handleFirestoreError(err, editingQr ? 'update' : 'create', 'qrCodes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetQrFields = () => {
    setNewQrName("");
    setNewQrType('link');
    setNewQrContent("");
    setNewQrFile(null);
    setQrFileError(null);
    setNewQrSlug("");
    setEditingQr(null);
  };

  const handleCreateFolder = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    try {
      if (editingFolder) {
        const { error } = await supabase.from("folders").update({
          name: newFolderName,
          updatedAt: nowIso(),
        }).eq("id", editingFolder.id);
        if (error) throw error;
        showToast("Directory renamed");
      } else {
        const { error } = await supabase.from("folders").insert({
          name: newFolderName,
          parentId: null, // Basic for now
          userId: user.id,
          managers: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        if (error) throw error;
        showToast("Sector allocated");
        confetti({
          particleCount: 100,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#000000', '#3b82f6'],
          gravity: 1.2
        });
      }

      setFolderModalOpen(false);
      setNewFolderName("");
      setEditingFolder(null);
    } catch (err) {
      handleFirestoreError(err, editingFolder ? 'update' : 'create', 'folders');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveFolderShare = async (e: FormEvent) => {
    e.preventDefault();
    if (!sharingFolder || !user) return;
    setIsSubmitting(true);
    try {
      const emails = folderManagersEmails.split(',').map(e => e.trim()).filter(e => e !== "");
      
      // Update folder managers
      const { error: folderError } = await supabase.from("folders").update({
        managers: emails,
        updatedAt: nowIso()
      }).eq("id", sharingFolder.id);
      if (folderError) throw folderError;

      // Update all QR codes in this folder to have the same managers
      const qrsInFolder = qrCodes.filter(q => q.folderId === sharingFolder.id);
      const batchPromises = qrsInFolder.map(q => 
        supabase.from("qrcodes").update({
          managers: emails,
          updatedAt: nowIso()
        }).eq("id", q.id)
      );
      const results = await Promise.all(batchPromises);
      const qrError = results.find(result => result.error);
      if (qrError?.error) throw qrError.error;

      showToast("Access protocol updated for directory and contents");
      setFolderShareModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, 'update', `folders/${sharingFolder.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteQr = async (id: string) => {
    setDeleteConfirm({ id, type: 'qr' });
  };

  const confirmDeleteQr = async (id: string) => {
    try {
      const { error } = await supabase.from("qrcodes").delete().eq("id", id);
      if (error) throw error;
      setSelectedQrIds(prev => prev.filter(selectedId => selectedId !== id));
      showToast("Asset purged");
    } catch (err) {
      handleFirestoreError(err, 'delete', `qrCodes/${id}`);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedQrIds.length === 0) return;
    setDeleteConfirm({ id: [...selectedQrIds], type: 'bulk' });
  };

  const confirmBulkDelete = async (ids: string[]) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("qrcodes").delete().in("id", ids);
      if (error) throw error;
      setSelectedQrIds([]);
      showToast("Selection purged");
    } catch (err) {
      handleFirestoreError(err, 'write', 'bulk-delete');
    } finally {
      setIsSubmitting(false);
      setDeleteConfirm(null);
    }
  };

  const handleBulkMove = async (targetFolderId: string | null) => {
    if (selectedQrIds.length === 0) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("qrcodes").update({
        folderId: targetFolderId,
        updatedAt: nowIso()
      }).in("id", selectedQrIds);
      if (error) throw error;
      setSelectedQrIds([]);
      setIsBulkMoving(false);
      showToast("Assets reallocated");
    } catch (err) {
      handleFirestoreError(err, 'update', 'bulk-move');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedQrIds.length === filteredQrCodes.length) {
      setSelectedQrIds([]);
    } else {
      setSelectedQrIds(filteredQrCodes.map(q => q.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedQrIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSaveShare = async (e: FormEvent) => {
    e.preventDefault();
    if (!sharingQr || !user) return;
    setIsSubmitting(true);
    try {
      const emails = shareEmails.split(',').map(e => e.trim()).filter(e => e !== "");
      const { error } = await supabase.from("qrcodes").update({
        visibility: shareVisibility,
        allowedEmails: emails,
        updatedAt: nowIso()
      }).eq("id", sharingQr.id);
      if (error) throw error;
      showToast("Access protocol updated");
      setShareModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, 'update', `qrCodes/${sharingQr.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteFolder = async (id: string) => {
    setDeleteConfirm({ id, type: 'folder' });
  };

  const confirmDeleteFolder = async (id: string) => {
    setIsSubmitting(true);
    try {
      // Find all QRs in this folder
      const qrsInFolder = qrCodes.filter(q => q.folderId === id);
      const qrDeleteResult = await supabase.from("qrcodes").delete().eq("folderId", id);
      if (qrDeleteResult.error) throw qrDeleteResult.error;
      const folderDeleteResult = await supabase.from("folders").delete().eq("id", id);
      if (folderDeleteResult.error) throw folderDeleteResult.error;
      if (activeFolderId === id) setActiveFolderId(null);
      showToast("Directory and contents purged");
    } catch (err) {
      handleFirestoreError(err, 'delete', `folders/${id}`);
    } finally {
      setIsSubmitting(false);
      setDeleteConfirm(null);
    }
  };

  const filteredQrCodes = qrCodes
    .filter(q => {
      const inFolder = q.folderId === activeFolderId;
      const search = searchQuery.toLowerCase();
      const matchesSearch = 
        q.name.toLowerCase().includes(search) || 
        q.slug.toLowerCase().includes(search) ||
        (q.content?.fileName?.toLowerCase().includes(search)) ||
        (q.content?.mimeType?.toLowerCase().includes(search)) ||
        (q.content?.fileSize && `${(q.content.fileSize / (1024 * 1024)).toFixed(2)} MB`.toLowerCase().includes(search));
      
      return inFolder && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      const timeA = toMillis(a[sortBy]);
      const timeB = toMillis(b[sortBy]);
      return timeB - timeA;
    });

  if (redirectPath) {
    if (redirectStatus === 'loading') {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-black gap-8">
          <div className="w-24 h-24 border-4 border-white/10 border-t-white rounded-full animate-spin" />
          <div className="text-[10px] tracking-[0.4em] text-white/50 uppercase animate-pulse">
            Processing Secure Handshake...
          </div>
        </div>
      );
    }
    if (redirectStatus === 'error') {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-white p-6 relative">
          <div className="absolute inset-0 cred-gradient-reward opacity-40" />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg text-center space-y-10"
          >
            <div className="w-24 h-24 mx-auto bg-red-50 text-red-500 rounded-full flex items-center justify-center">
              <Scan className="w-10 h-10" />
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight">Signal Interrupted.</h1>
              <p className="text-slate-400 text-sm leading-relaxed">{redirectMessage}</p>
            </div>
            <div className="flex gap-4 pt-10">
              <button 
                onClick={() => window.location.href = '/'}
                className="flex-1 bg-black text-white py-5 px-10 font-bold text-xs uppercase tracking-[0.3em] cred-button-tactile"
              >
                Return to Dashboard
              </button>
            </div>
          </motion.div>
        </div>
      );
    }
    if (redirectStatus === 'success') {
      const qr = sharingQr;

      // For direct links that haven't redirected yet (should be rare as handleRedirect does window.location.href)
      if (!qr || qr.type === 'link' || (!qr.type && qr.targetUrl)) {
        return (
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-white gap-8 font-sans">
            <div className="w-24 h-24 border-4 border-black border-t-transparent rounded-full animate-spin" />
            <div className="text-[10px] tracking-[0.4em] text-black uppercase animate-pulse">
              Redirecting to Secure Resource...
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white p-4 md:p-6 lg:p-10 relative overflow-hidden font-sans">
          <div className="absolute inset-0 cred-gradient-reward opacity-40 pointer-events-none" />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl bg-white border border-slate-200 shadow-2xl rounded-3xl p-6 md:p-8 lg:p-12 relative z-10"
          >
            <div className="flex items-center justify-between mb-8 md:mb-12">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shrink-0">
                  {qr.type === 'text' ? <FileText className="w-5 h-5" /> : <File className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg md:text-xl font-bold tracking-tight text-black truncate">{qr.name}</h1>
                  <p className="text-[8px] uppercase tracking-[0.4em] text-slate-400 mt-1">Decrypted Archive Resource</p>
                </div>
              </div>
              <button 
                onClick={() => window.location.href = '/'}
                className="p-3 text-slate-300 hover:text-black hover:bg-black/5 rounded-full transition-all shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-[200px] flex flex-col">
              {qr.type === 'text' ? (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 md:p-8 flex-1">
                   <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{qr.content.value}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded-2xl p-4 md:p-8 flex-1 gap-6 overflow-hidden">
                   {/* Preview Logic */}
                   {qr.content.mimeType?.startsWith('image/') ? (
                     <div className="w-full h-full min-h-[300px] flex items-center justify-center">
                        <img 
                          src={qr.content.value} 
                          alt={qr.content.fileName}
                          className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm"
                        />
                     </div>
                   ) : qr.content.mimeType === 'application/pdf' ? (
                     <div className="w-full h-full min-h-[400px] md:min-h-[500px] bg-slate-200 rounded-lg overflow-hidden">
                        <iframe 
                          src={`${qr.content.value}#toolbar=0`} 
                          className="w-full h-[400px] md:h-[600px]"
                          title="PDF Preview"
                        />
                     </div>
                   ) : qr.content.mimeType?.startsWith('video/') ? (
                     <div className="w-full rounded-lg overflow-hidden bg-black aspect-video">
                        <video controls className="w-full h-full">
                          <source src={qr.content.value} type={qr.content.mimeType} />
                          Your browser does not support the video tag.
                        </video>
                     </div>
                   ) : (
                     <div className="flex flex-col items-center gap-6 py-6 font-sans">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-black/5 rounded-full flex items-center justify-center">
                           <File className="w-8 h-8 md:w-10 md:h-10 text-black" />
                        </div>
                        <div className="text-center space-y-1">
                           <p className="text-base md:text-lg font-bold text-black">{qr.content.fileName}</p>
                           <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                             {qr.content.fileSize ? `${(qr.content.fileSize / (1024 * 1024)).toFixed(2)} MB` : 'Secure Artifact'}
                           </p>
                        </div>
                     </div>
                   )}

                   <div className="w-full flex justify-center pt-4 border-t border-slate-200">
                     <a 
                       href={qr.content.value} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="w-full md:w-auto bg-black text-white py-4 px-10 rounded-xl font-bold text-[10px] uppercase tracking-[0.2em] cred-button-tactile inline-flex items-center justify-center gap-3"
                     >
                       <Download className="w-4 h-4" />
                       Download Artifact
                     </a>
                   </div>
                </div>
              )}
            </div>

            <div className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-slate-100 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img 
                      src="https://ait-website.github.io/aitpune/aitlogoo.png" 
                      alt="Logo" 
                      className="w-4 h-4 object-contain brightness-0"
                    />
                  </div>
                  <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">AIT Secure Vault</span>
               </div>
               <span className="text-[9px] text-slate-300 font-mono">{formatDate(qr.createdAt).split(',')[0]}</span>
            </div>
          </motion.div>
        </div>
      );
    }
  }

  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-white gap-8">
      <motion.img 
        src="https://ait-website.github.io/aitpune/aitlogoo.png"
        alt="AIT Pune Logo"
        className="w-24 h-24 object-contain brightness-0"
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.5, 1, 0.5]
        }}
        transition={{ 
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <div className="text-[10px] tracking-[0.4em] text-slate-400 uppercase animate-pulse">
        Initialising Secure Protocol...
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-white p-6 relative overflow-hidden">
      <div className="absolute inset-0 cred-gradient-reward opacity-40 pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-lg text-center relative z-10"
      >
        <div className="mb-20">
          <div className="w-32 h-32 mx-auto mb-10 flex items-center justify-center">
             <img 
               src="https://ait-website.github.io/aitpune/aitlogoo.png" 
               alt="AIT Pune Logo" 
               className="w-full h-full object-contain brightness-0"
             />
          </div>
          <h1 className="text-6xl text-black mb-6 tracking-tight leading-tight">
            built for the <br /> <span className="opacity-50">creditworthy.</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400">AIT College Pune / Secure Protocol</p>
        </div>
        
        <button 
          onClick={handleLogin}
          className="w-full bg-black text-white py-5 px-10 hover:bg-slate-900 transition-all font-bold text-xs uppercase tracking-[0.3em] flex items-center justify-center gap-4 group cred-button-tactile"
        >
          Send Access Link
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
        
        <p className="mt-12 text-[10px] items-center justify-center flex gap-2 text-slate-400 uppercase tracking-widest opacity-40">
          <Settings className="w-3 h-3" />
          Trust has its privileges.
        </p>
      </motion.div>
    </div>
  );

  const sortedFolders = [...folders].sort((a, b) => {
    if (folderSortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    const timeA = toMillis(a[folderSortBy]);
    const timeB = toMillis(b[folderSortBy]);
    return timeB - timeA;
  });

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-white text-black selection:bg-black selection:text-white font-sans relative">
      {/* --- Sidebar: Mobile Overlay --- */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* --- Sidebar: Clean Surface --- */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 bg-slate-50 border-r border-slate-100 flex flex-col transition-transform duration-300 z-50 lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 border-b border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 flex items-center justify-center">
              <img 
                src="https://ait-website.github.io/aitpune/aitlogoo.png" 
                alt="AIT Pune Logo" 
                className="w-full h-full object-contain brightness-0"
              />
            </div>
            <h1 className="text-2xl tracking-tighter font-bold">AIT Pune</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-bold tracking-[0.1em] uppercase">Secure Archive Management</p>
        </div>

        <div className="flex-1 overflow-y-auto py-8 px-4 flex flex-col min-h-0 space-y-10">
          {/* Folders */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4">
              <h2 className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.15em]">The Directory</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setFolderSortBy("name")}
                  className={cn("text-[8px] font-bold uppercase transition-all px-1.5 py-0.5 rounded", folderSortBy === "name" ? "bg-black text-white" : "text-slate-300 hover:text-slate-500")}
                >
                  A-Z
                </button>
                <button 
                  onClick={() => setFolderSortBy("createdAt")}
                  className={cn("text-[8px] font-bold uppercase transition-all px-1.5 py-0.5 rounded", folderSortBy === "createdAt" ? "bg-black text-white" : "text-slate-300 hover:text-slate-500")}
                >
                  New
                </button>
                <button 
                  onClick={() => setFolderSortBy("updatedAt")}
                  className={cn("text-[8px] font-bold uppercase transition-all px-1.5 py-0.5 rounded", folderSortBy === "updatedAt" ? "bg-black text-white" : "text-slate-300 hover:text-slate-500")}
                >
                  Mod
                </button>
              </div>
            </div>
            
            <nav className="space-y-1.5">
              <button
                onClick={() => {
                  setActiveFolderId(null);
                  setSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3 text-xs font-semibold rounded-lg transition-all duration-300 text-left group",
                  activeFolderId === null 
                    ? "bg-white text-black border border-slate-200 cred-card-shadow" 
                    : "text-slate-500 hover:bg-black/5"
                )}
              >
                <LayoutGrid className={cn("w-4 h-4", activeFolderId === null ? "text-black" : "opacity-40")} />
                Root Archive
              </button>

              {foldersLoading ? (
                <div className="space-y-2 px-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : sortedFolders.map(f => (
                <div key={f.id} className="group relative">
                  <button
                    onClick={() => {
                      setActiveFolderId(f.id);
                      setSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 px-4 py-3 text-xs font-semibold rounded-lg transition-all duration-300 text-left truncate pr-20",
                      activeFolderId === f.id 
                        ? "bg-white text-black border border-slate-200 cred-card-shadow" 
                        : "text-slate-500 hover:bg-black/5"
                    )}
                  >
                    <FolderIcon className={cn("w-4 h-4", activeFolderId === f.id ? "text-black" : "opacity-40")} />
                    <span className="truncate flex-1">{f.name}</span>
                  </button>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => {
                        setSharingFolder(f);
                        setFolderManagersEmails(f.managers?.join(", ") || "");
                        setFolderShareModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-black transition-colors"
                      title="Team Collaboration"
                    >
                      <Users className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingFolder(f);
                        setNewFolderName(f.name);
                        setFolderModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-black transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => deleteFolder(f.id)}
                      className="p-1.5 text-red-500 hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </nav>
          </div>

          <button 
            onClick={() => {
              setFolderModalOpen(true);
              setSidebarOpen(false);
            }}
            className="w-full flex items-center justify-center gap-3 py-4 border border-dashed border-slate-200 text-slate-400 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:border-black hover:text-black transition-all group"
          >
            <Plus className="w-3 h-3 group-hover:rotate-90 transition-transform duration-300" />
            Allocate Space
          </button>
        </div>

        {/* Profile Footer */}
        <div className="p-6 mt-auto border-t border-slate-100 bg-slate-50/50 space-y-4">
          <button 
            id="sidebar-guide-btn"
            onClick={() => {
              setOnboardingStep(1);
              setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-dashed border-slate-200 hover:border-black/20 hover:bg-black/5 transition-all group text-left"
          >
            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-white transition-colors">
              <HelpCircle className="w-4 h-4 text-slate-400 group-hover:text-black" />
            </div>
            <div className="flex flex-col gap-0.5">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-black">Function Guide</h4>
              <p className="text-[9px] text-slate-400">What does what?</p>
            </div>
          </button>

          <div className="flex items-center gap-4 px-2">
            <div 
              className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg cred-button-tactile cursor-pointer"
              onClick={() => {
                setEditName(profile?.name || "");
                setEditEmail(profile?.email || user.email || "");
                setProfileModalOpen(true);
                setSidebarOpen(false);
              }}
            >
              <div className="text-black">
                {profile?.name?.[0]?.toUpperCase() || user.email?.[0].toUpperCase()}
              </div>
            </div>
            <div className="flex flex-col flex-1 truncate">
              {profile?.name ? (
                <span className="text-xs font-bold text-black truncate tracking-tight">{profile.name}</span>
              ) : (
                <button 
                  onClick={() => setProfileModalOpen(true)}
                  className="text-left text-[10px] font-bold text-black hover:underline transition-colors uppercase tracking-widest"
                >
                  Enter Club
                </button>
              )}
              <span className="text-[10px] text-slate-400 truncate font-medium">
                {profile?.email || "awaiting eligibility"}
              </span>
            </div>
            <button onClick={() => { supabase.auth.signOut(); }} className="text-slate-400 hover:text-black transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* --- Main Content: The Stage --- */}
      <main className="flex-1 flex flex-col bg-white overflow-hidden relative w-full">
        <div className="absolute inset-0 cred-gradient-reward opacity-30 pointer-events-none" />
        
        <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center justify-between px-4 lg:px-10 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-400 hover:text-black transition-colors"
            >
              <MoreHorizontal className="w-6 h-6 rotate-90" />
            </button>
            <div className="flex items-center gap-2 lg:gap-3 shrink-0">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] hidden sm:inline">Ascension</span>
              <ChevronRight className="w-3 h-3 text-slate-200 hidden sm:inline" />
              <span className="text-xs font-bold text-black lg:text-lg truncate max-w-[100px] sm:max-w-none">
                {activeFolderId ? folders.find(f => f.id === activeFolderId)?.name : "General Access"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 lg:gap-6">
            <div className="hidden xl:flex px-4 py-1.5 bg-black/[0.03] text-black text-[10px] font-bold uppercase rounded-full border border-black/10 tracking-widest">
              Secure Protocol Active
            </div>
            <button 
              onClick={() => {
                setOnboardingStep(1);
              }}
              className="p-3 text-slate-400 hover:text-black hover:bg-black/5 rounded-full transition-all"
              title="Function Guide"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                resetQrFields();
                setNewQrFgColor("#000000");
                setNewQrBgColor("#FFFFFF");
                setQrModalOpen(true);
              }}
              className="bg-black text-white text-[10px] lg:text-xs font-bold px-4 lg:px-8 py-2.5 lg:py-3 rounded-sm cred-button-tactile flex items-center gap-2 uppercase tracking-widest shadow-lg shadow-black/10 transition-all active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-3 h-3 lg:w-4 h-4" />
              <span className="hidden sm:inline">Generate QR</span>
              <span className="sm:hidden text-[9px]">New QR</span>
            </button>
          </div>
        </header>

        <div className="p-4 lg:p-10 flex flex-col min-h-0 z-10 space-y-4 lg:space-y-10 flex-1">
          {/* Resource List */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden flex flex-col h-full ring-1 ring-black/[0.02]">
              <div className="px-4 lg:px-8 py-4 lg:py-6 border-b border-slate-100 flex flex-col xl:flex-row xl:justify-between xl:items-center gap-4 bg-slate-50/50 backdrop-blur-sm">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6 flex-1">
                   <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400 whitespace-nowrap">Active Assets</h3>
                   <div className="relative group flex-1 max-w-none sm:max-w-sm">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 transition-colors group-focus-within:text-black" />
                    <input 
                      type="text" 
                      placeholder="Search archive..." 
                      className="bg-white border border-slate-100 text-xs py-2.5 lg:py-3 pl-12 pr-4 rounded-xl focus:outline-none focus:border-black/20 w-full transition-all duration-300 placeholder:text-slate-300 text-black"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-2 sm:pb-0">
                  <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em] hidden sm:inline whitespace-nowrap">Sort by</span>
                  <div className="flex bg-white border border-slate-100 p-0.5 rounded-lg shadow-sm shrink-0">
                    {(['name', 'createdAt', 'updatedAt'] as const).map((option) => (
                      <button
                        key={option}
                        onClick={() => setSortBy(option)}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all",
                          sortBy === option 
                            ? "bg-black text-white" 
                            : "text-slate-400 hover:text-black hover:bg-slate-50"
                        )}
                      >
                        {option === 'name' ? 'A-Z' : option === 'createdAt' ? 'New' : 'Mod'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Desktop view */}
                <table className="w-full text-left border-collapse hidden lg:table">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 bg-slate-50/30">
                      <th className="px-8 py-5 w-12">
                        <input 
                          type="checkbox" 
                          checked={filteredQrCodes.length > 0 && selectedQrIds.length === filteredQrCodes.length}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-slate-300 text-black focus:ring-black cursor-pointer"
                        />
                      </th>
                      <th className="px-8 py-5 w-16 font-bold">QR</th>
                      <th className="px-8 py-5 font-bold">The Resource</th>
                      <th className="px-8 py-5 font-bold">The Protocol</th>
                      <th className="px-8 py-5 font-bold">Timestamp</th>
                      <th className="px-8 py-5 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {qrCodesLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={`skeleton-table-${i}`} className="border-b border-slate-50">
                          <td className="px-8 py-6 w-12"><Skeleton className="h-4 w-4" /></td>
                          <td className="px-8 py-6 w-16"><Skeleton className="h-4 w-10" /></td>
                          <td className="px-8 py-6"><Skeleton className="h-4 w-32" /></td>
                          <td className="px-8 py-6"><Skeleton className="h-4 w-64" /></td>
                          <td className="px-8 py-6"><Skeleton className="h-4 w-24" /></td>
                          <td className="px-8 py-6"><Skeleton className="h-4 w-24 ml-auto" /></td>
                        </tr>
                      ))
                    ) : filteredQrCodes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-32 text-center">
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                          >
                            <QrIcon className="w-16 h-16 mx-auto mb-6 text-slate-100" />
                            <p className="text-slate-400 text-xl">The vault is currently silent.</p>
                            <p className="text-[10px] uppercase tracking-widest text-slate-300 mt-3">awaiting your first deployment</p>
                          </motion.div>
                        </td>
                      </tr>
                    ) : filteredQrCodes.map((qr, idx) => (
                      <motion.tr 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ 
                          scale: 1.002, 
                          backgroundColor: "rgba(0,0,0,0.012)",
                          boxShadow: "0 4px 20px -5px rgba(0,0,0,0.05)"
                        }}
                        transition={{ 
                          delay: idx * 0.05, 
                          duration: 0.4, 
                          ease: [0.2, 0.8, 0.2, 1],
                          scale: { duration: 0.2 },
                          backgroundColor: { duration: 0.2 }
                        }}
                        key={qr.id} 
                        className={cn(
                          "border-b border-slate-50 transition-colors cursor-pointer group relative",
                          selectedQrIds.includes(qr.id) && "bg-black/[0.02]"
                        )}
                        onClick={() => {
                          setEditingQr(qr);
                          setNewQrName(qr.name);
                          setNewQrType(qr.type || 'link');
                          setNewQrContent(qr.content?.value || qr.targetUrl || "");
                          setNewQrSlug(qr.slug);
                          setNewQrFgColor(qr.fgColor || "#000000");
                          setNewQrBgColor(qr.bgColor || "#FFFFFF");
                          setQrModalOpen(true);
                        }}
                      >
                        <td className="px-8 py-6" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={selectedQrIds.includes(qr.id)}
                            onChange={() => toggleSelect(qr.id)}
                            className="w-4 h-4 rounded border-slate-300 text-black focus:ring-black cursor-pointer"
                          />
                        </td>
                        <td className="px-8 py-6">
                          <div className="w-10 h-10 p-1 bg-white border border-slate-100 rounded-lg shadow-sm">
                            <QRCodeSVG 
                              value={`${appUrl}/r/${qr.slug}`}
                              size={32}
                              level="L"
                              fgColor={qr.fgColor || "#000000"}
                              bgColor={qr.bgColor || "#FFFFFF"}
                            />
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-black border-b border-transparent group-hover:border-black transition-all inline-block w-fit text-sm">{qr.name}</span>
                            <span className="text-[10px] text-slate-400 tracking-wider opacity-60">ID: {qr.id.substring(0, 8)}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 group-hover:bg-black group-hover:text-white transition-all bg-black/[0.03] px-2 py-0.5 rounded border border-black/5">
                              {(!qr.type || qr.type === 'link') && <LinkIcon className="w-3 h-3" />}
                              {qr.type === 'text' && <Type className="w-3 h-3" />}
                              {qr.type === 'file' && <File className="w-3 h-3" />}
                              <span className="text-[11px] font-bold uppercase tracking-widest">{qr.slug}</span>
                            </div>
                            <ChevronRight className="w-2.5 h-2.5 text-slate-200" />
                            <span className="text-slate-400 text-[10px] truncate max-w-[200px] opacity-60 group-hover:opacity-100 transition-opacity">
                              {qr.type === 'file' ? (qr.content?.fileName || 'Artifact Payload') : (qr.content?.value || qr.targetUrl)}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-slate-400 text-[11px] tracking-tighter uppercase">
                          {formatDate(qr.createdAt).split(',')[0]}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-3 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSharingQr(qr);
                                setShareVisibility(qr.visibility || 'public');
                                setShareEmails(qr.allowedEmails?.join(", ") || "");
                                setShareModalOpen(true);
                              }} 
                              className="p-2 text-slate-400 hover:text-black hover:bg-black/5 rounded-lg transition-all"
                              title="Access Control"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`${appUrl}/r/${qr.slug}`, "_blank");
                              }} 
                              className="p-2 text-slate-400 hover:text-black hover:bg-black/5 rounded-lg transition-all"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteQr(qr.id);
                              }} 
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile view */}
                <div className="lg:hidden p-6 space-y-4">
                  {qrCodesLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={`skeleton-mobile-${i}`} className="bg-slate-50/50 border border-slate-100 rounded-xl p-5 space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-4">
                            <Skeleton className="h-4 w-4 rounded" />
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-20" />
                            </div>
                          </div>
                        </div>
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </div>
                    ))
                  ) : filteredQrCodes.length === 0 ? (
                    <div className="py-20 text-center">
                      <QrIcon className="w-12 h-12 mx-auto mb-4 text-slate-100" />
                      <p className="text-slate-400 text-sm">Quiet in the vaults...</p>
                    </div>
                  ) : filteredQrCodes.map((qr) => (
                    <div 
                      key={qr.id}
                      onClick={() => {
                        setEditingQr(qr);
                        setNewQrName(qr.name);
                        setNewQrType(qr.type || 'link');
                        setNewQrContent(qr.content?.value || qr.targetUrl || "");
                        setNewQrSlug(qr.slug);
                        setNewQrFgColor(qr.fgColor || "#000000");
                        setNewQrBgColor(qr.bgColor || "#FFFFFF");
                        setQrModalOpen(true);
                      }}
                      className={cn(
                        "bg-slate-50/50 border border-slate-100 rounded-xl p-5 space-y-4 active:scale-[0.98] transition-transform relative",
                        selectedQrIds.includes(qr.id) && "ring-2 ring-black"
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-4">
                          <input 
                            type="checkbox" 
                            checked={selectedQrIds.includes(qr.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelect(qr.id);
                            }}
                            className="mt-1 w-4 h-4 rounded border-slate-300 text-black focus:ring-black cursor-pointer"
                          />
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              {(!qr.type || qr.type === 'link') && <LinkIcon className="w-2.5 h-2.5 text-slate-300" />}
                              {qr.type === 'text' && <Type className="w-2.5 h-2.5 text-slate-300" />}
                              {qr.type === 'file' && <File className="w-2.5 h-2.5 text-slate-300" />}
                              <span className="font-bold text-black text-sm">{qr.name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono tracking-tight opacity-70">
                              {qr.type === 'file' ? (qr.content?.fileName || 'Artifact Payload') : (qr.content?.value || qr.targetUrl)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 p-0.5 bg-white border border-slate-100 rounded-lg shadow-sm">
                            <QRCodeSVG 
                              value={`${appUrl}/r/${qr.slug}`}
                              size={28}
                              level="L"
                              fgColor={qr.fgColor || "#000000"}
                              bgColor={qr.bgColor || "#FFFFFF"}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSharingQr(qr);
                              setShareVisibility(qr.visibility || 'public');
                              setShareEmails(qr.allowedEmails?.join(", ") || "");
                              setShareModalOpen(true);
                            }}
                            className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm"
                          >
                            <Copy className="w-4 h-4 text-slate-400" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`${appUrl}/r/${qr.slug}`, "_blank");
                            }}
                            className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm"
                          >
                            <ExternalLink className="w-4 h-4 text-slate-400" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteQr(qr.id);
                            }}
                            className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 uppercase tracking-widest">{formatDate(qr.createdAt).split(',')[0]}</span>
                          <ChevronRight className="w-4 h-4 text-slate-200" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* --- Bulk Action Bar --- */}
      <AnimatePresence>
        {selectedQrIds.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-4 rounded-full shadow-2xl z-[100] flex items-center gap-8 min-w-[320px] lg:min-w-[400px] border border-white/10"
          >
            <div className="flex items-center gap-3 pr-8 border-r border-white/20">
              <span className="text-xl font-bold">{selectedQrIds.length}</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-white/50">Selected Assets</span>
            </div>

            <div className="flex items-center gap-4 flex-1">
              <div className="relative group">
                <button 
                  onClick={() => setIsBulkMoving(!isBulkMoving)}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest hover:text-white/70 transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                  Move
                </button>
                
                <AnimatePresence>
                  {isBulkMoving && (
                    <motion.div
                      initial={{ opacity: 0, y: -20, scale: 0.95 }}
                      animate={{ opacity: 1, y: -10, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.95 }}
                      className="absolute bottom-full left-0 mb-4 bg-white text-black p-4 rounded-2xl shadow-2xl border border-slate-100 min-w-[200px] z-[110]"
                    >
                      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-4 px-2">Target Sector</p>
                      <div className="space-y-1">
                        <button
                          onClick={() => handleBulkMove(null)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-all text-left"
                        >
                          <LayoutGrid className="w-3.5 h-3.5 opacity-40" />
                          Root Archive
                        </button>
                        {folders.map(f => (
                          <button
                            key={f.id}
                            onClick={() => handleBulkMove(f.id)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-all text-left"
                          >
                            <FolderIcon className="w-3.5 h-3.5 opacity-40" />
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button 
                onClick={handleBulkDelete}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors ml-auto"
              >
                <Trash2 className="w-4 h-4" />
                Discard
              </button>
            </div>

            <button 
              onClick={() => setSelectedQrIds([])}
              className="p-2 hover:bg-white/10 rounded-full transition-all"
            >
              <Plus className="rotate-45 w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Onboarding Tour --- */}
      <AnimatePresence>
        {onboardingStep > 0 && (
          <div className="fixed inset-0 z-[200] pointer-events-none">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
              onClick={() => {
                localStorage.setItem('hasSeenOnboarding', 'true');
                setOnboardingStep(0);
              }}
            />
            
            <div className="absolute inset-0 flex items-center justify-center p-4 md:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white max-w-sm w-full p-6 md:p-8 rounded-2xl shadow-3xl border border-slate-100 pointer-events-auto relative"
              >
                <div className="absolute -top-10 md:-top-12 left-1/2 -translate-x-1/2 w-20 h-20 md:w-24 md:h-24 bg-black rounded-3xl flex items-center justify-center rotate-12 shadow-2xl">
                  {onboardingStep === 1 && <QrIcon className="w-10 h-10 md:w-12 md:h-12 text-white" />}
                  {onboardingStep === 2 && <FolderIcon className="w-10 h-10 md:w-12 md:h-12 text-white" />}
                  {onboardingStep === 3 && <Users className="w-10 h-10 md:w-12 md:h-12 text-white" />}
                  {onboardingStep === 4 && <Settings className="w-10 h-10 md:w-12 md:h-12 text-white" />}
                </div>

                <div className="mt-10 md:mt-12 text-center space-y-4">
                  <div className="flex justify-center gap-1">
                    {[1, 2, 3, 4].map(s => (
                      <div key={s} className={cn("w-1 h-1 rounded-full transition-all", s === onboardingStep ? "w-4 bg-black" : "bg-slate-200")} />
                    ))}
                  </div>
                  
                   <h3 className="text-lg md:text-xl font-bold text-black tracking-tight">
                    {onboardingStep === 1 && "1. Deploy New QRs"}
                    {onboardingStep === 2 && "2. Sector Folders"}
                    {onboardingStep === 3 && "3. Filter & Search"}
                    {onboardingStep === 4 && "4. Master Profile"}
                  </h3>
                  
                  <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                    {onboardingStep === 1 && "Click the 'Deploy QR' button in the toolbar to create links or upload files. These are dynamic, meaning you can update the destination anytime without reprinting."}
                    {onboardingStep === 2 && "Click 'Allocate Space' or the '+' icon in the sidebar to create folders. Use them to group your resources by project or category."}
                    {onboardingStep === 3 && "The 'Search Archive' input at the top allows you to find QRs by name, URL, or even file metadata. Use icons in the table header to change view filters."}
                    {onboardingStep === 4 && "Access your Identity Protocol at the bottom left by clicking your name. Here you can edit your system identity and verification status."}
                  </p>

                  <div className="flex gap-3 pt-4">
                    {onboardingStep > 1 && (
                      <button 
                        onClick={() => setOnboardingStep(prev => prev - 1)}
                        className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                      >
                        Previous
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        if (onboardingStep < 4) setOnboardingStep(prev => prev + 1);
                        else {
                          localStorage.setItem('hasSeenOnboarding', 'true');
                          setOnboardingStep(0);
                        }
                      }}
                      className="flex-[2] py-3 text-[10px] font-bold uppercase tracking-widest bg-black text-white rounded-lg shadow-lg shadow-black/10 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      {onboardingStep === 4 ? "Begin Ascension" : "Next Protocol"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Modals: Cinematic Overlays --- */}
      <AnimatePresence mode="wait">
        {isQrModalOpen && (
          <div key="modal-qr" className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQrModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
              className="bg-white w-full max-w-4xl relative z-60 border border-slate-200 shadow-2xl overflow-y-auto max-h-[90vh] rounded-xl lg:rounded-2xl"
            >
              <div className="cred-gradient-reward absolute inset-0 opacity-10 pointer-events-none" />
              
              <div className="flex justify-between items-start p-6 lg:p-10 relative">
                <div>
                  <h2 className="text-2xl lg:text-4xl text-black mb-1 lg:mb-2">{editingQr ? "Modify Interface" : "New Deployment"}</h2>
                  <p className="text-[10px] uppercase tracking-[0.4em] text-slate-400">Resource configuration protocol</p>
                </div>
                <button 
                   onClick={() => setQrModalOpen(false)} 
                   className="p-2 lg:p-3 text-slate-400 hover:text-black hover:bg-black/5 rounded-full transition-all"
                >
                  <Plus className="rotate-45 w-5 h-5 lg:w-6 h-6" />
                </button>
              </div>

              <div className="flex flex-col lg:grid lg:grid-cols-2 gap-8 lg:gap-16 p-6 lg:p-10 lg:pt-0 relative">
                <form onSubmit={handleCreateQr} className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block">Resource Identifier</label>
                    <input 
                      required
                      type="text" 
                      value={newQrName}
                      onChange={(e) => setNewQrName(e.target.value)}
                      placeholder="e.g. Student Entrance Protocol"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:ring-0 focus:border-black outline-none text-sm text-black transition-all placeholder:text-slate-300"
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block">Content Protocol</label>
                    <div className="flex p-1 bg-slate-100 rounded-xl">
                      {[
                        { id: 'link', icon: LinkIcon, label: 'Link' },
                        { id: 'text', icon: Type, label: 'Text' },
                        { id: 'file', icon: FileUp, label: 'File' },
                      ].map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setNewQrType(type.id as any)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                            newQrType === type.id 
                              ? "bg-white text-black shadow-sm" 
                              : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          <type.icon className="w-3.5 h-3.5" />
                          {type.label}
                        </button>
                      ))}
                    </div>

                    <div className="pt-2">
                      {newQrType === 'link' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block">Destination Protocol (URL)</label>
                          <input 
                            id="qr-url-input"
                            required
                            type="url" 
                            value={newQrContent}
                            onChange={(e) => setNewQrContent(e.target.value)}
                            placeholder="https://ait.edu/protocol"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:ring-0 focus:border-black outline-none text-sm text-black transition-all placeholder:text-slate-300"
                          />
                        </div>
                      )}

                      {newQrType === 'text' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block">Message Payload</label>
                          <textarea 
                            required
                            value={newQrContent}
                            onChange={(e) => setNewQrContent(e.target.value)}
                            placeholder="Entrust your message to this artifact..."
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:ring-0 focus:border-black outline-none text-sm text-black transition-all placeholder:text-slate-300 resize-none"
                          />
                        </div>
                      )}

                      {newQrType === 'file' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block">Physical Artifact (PDF, CSV, Image, MP4)</label>
                          <div className="relative group">
                            <input 
                              type="file" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                setQrFileError(null);
                                setFilePreviewUrl(null);
                                if (file) {
                                  if (file.size > MAX_FILE_SIZE) {
                                    setQrFileError("Archive exceeds 20MB limit. Split your artifact.");
                                    return;
                                  }
                                  if (!ALLOWED_TYPES.includes(file.type)) {
                                    setQrFileError(`Unsupported extension: ${file.type.split('/')[1].toUpperCase()}. Use PDF, CSV, JPG, PNG, GIF or MP4.`);
                                    return;
                                  }
                                  setNewQrFile(file);
                                  if (!newQrName) setNewQrName(file.name.split('.')[0]);
                                  
                                  // Create preview for images
                                  if (file.type.startsWith('image/')) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setFilePreviewUrl(reader.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className={cn(
                              "w-full bg-slate-50 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all",
                              qrFileError ? "border-red-200 bg-red-50/30" : 
                              newQrFile ? "border-black bg-black/[0.02]" : "border-slate-200 group-hover:border-slate-300"
                            )}>
                              {qrFileError ? (
                                <>
                                  <AlertCircle className="w-8 h-8 text-red-400" />
                                  <p className="text-[10px] text-red-500 uppercase tracking-widest font-bold text-center">{qrFileError}</p>
                                </>
                              ) : newQrFile ? (
                                <div className="flex flex-col items-center gap-4">
                                  {filePreviewUrl ? (
                                    <div className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                                      <img src={filePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                                    </div>
                                  ) : (
                                    <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center">
                                      {newQrFile.type === 'application/pdf' ? <FileText className="w-8 h-8 text-black" /> : <File className="w-8 h-8 text-black" />}
                                    </div>
                                  )}
                                  <div className="text-center">
                                    <p className="text-sm font-bold text-black max-w-[200px] truncate">{newQrFile.name}</p>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">
                                      {(newQrFile.size / (1024 * 1024)).toFixed(2)} MB • {newQrFile.type.split('/')[1].toUpperCase()}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <FileUp className="w-8 h-8 text-slate-300 group-hover:text-slate-400 transition-colors" />
                                  <div className="text-center">
                                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Select Artifact</p>
                                    <p className="text-[9px] text-slate-300 mt-1 uppercase tracking-tight">PDF, CSV, JPG, PNG, GIF, MP4 (Max 20MB)</p>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          {uploadProgress !== null && (
                            <div className="mt-4 space-y-2 animate-in fade-in duration-300">
                              <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-bold">
                                <span className="text-black">Uploading Artifact</span>
                                <span className="text-slate-400">{Math.round(uploadProgress)}%</span>
                              </div>
                              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                  className="h-full bg-black"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${uploadProgress}%` }}
                                  transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                                />
                              </div>
                            </div>
                          )}
                          {editingQr && editingQr.type === 'file' && !newQrFile && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-2 bg-slate-50 p-2 rounded">
                              <FileText className="w-3 h-3" />
                              Current: {editingQr.content.fileName || 'Existing Artifact'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {!editingQr && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block">Secure Slug (Optional)</label>
                      <div className="relative group">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-xs">/r/</span>
                        <input 
                          type="text" 
                          value={newQrSlug}
                          onChange={(e) => setNewQrSlug(e.target.value)}
                          placeholder="unique-path"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-12 py-4 focus:ring-0 focus:border-black outline-none text-sm text-black transition-all placeholder:text-slate-300"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block">Foreground</label>
                      <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                        <input 
                          type="color" 
                          value={newQrFgColor}
                          onChange={(e) => setNewQrFgColor(e.target.value)}
                          className="w-8 h-8 rounded-md cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-xs font-mono text-slate-500">{newQrFgColor.toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 block">Background</label>
                      <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
                        <input 
                          type="color" 
                          value={newQrBgColor}
                          onChange={(e) => setNewQrBgColor(e.target.value)}
                          className="w-8 h-8 rounded-md cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-xs font-mono text-slate-500">{newQrBgColor.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 mt-4">
                    <button 
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setQrModalOpen(false);
                        resetQrFields();
                      }}
                      className="flex-1 border border-slate-200 text-slate-400 py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all disabled:opacity-50"
                    >
                      Discard
                    </button>
                    <button 
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setIsScannerOpen(true)}
                      className="flex-1 border-2 border-black text-black py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Scan className="w-4 h-4" />
                      Scan
                    </button>
                    <button 
                      disabled={isSubmitting}
                      className="flex-1 bg-black text-white py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.2em] cred-button-tactile disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      {editingQr ? "Apply" : "Deploy"}
                    </button>
                  </div>
                </form>

                <div className="flex flex-col items-center justify-center border-t lg:border-t-0 lg:border-l border-slate-100 pt-8 lg:pt-0 lg:pl-16 bg-slate-50/50 rounded-2xl p-6 lg:p-8 shadow-inner">
                  <div className="p-6 lg:p-8 bg-white rounded-xl shadow-lg relative group cursor-pointer overflow-hidden transition-transform duration-500 hover:scale-[1.02] border border-slate-100">
                    <div className="absolute inset-0 bg-gradient-to-tr from-black/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <QRCodeSVG 
                      id="qr-downloadable"
                      value={newQrSlug ? `${appUrl}/r/${newQrSlug}` : (editingQr ? `${appUrl}/r/${editingQr.slug}` : `${appUrl}/r/preview`)} 
                      size={window.innerWidth < 1024 ? 180 : 240}
                      level="L"
                      marginSize={1}
                      fgColor={newQrFgColor}
                      bgColor={newQrBgColor}
                    />
                  </div>
                  <div className="mt-8 lg:mt-10 text-center w-full space-y-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-[0.3em] mb-4 lg:mb-6">Secured Artifact Preview</p>
                    <div className="grid grid-cols-2 lg:flex lg:flex-row gap-3 lg:gap-4 justify-center">
                          <button 
                            onClick={() => {
                              const svg = document.getElementById("qr-downloadable");
                              if (!svg) return;
                              const svgData = new XMLSerializer().serializeToString(svg);
                              const canvas = document.createElement("canvas");
                              const ctx = canvas.getContext("2d");
                              const img = new Image();
                              img.onload = () => {
                                canvas.width = img.width;
                                canvas.height = img.height;
                                ctx?.drawImage(img, 0, 0);
                                const pngUrl = canvas.toDataURL("image/png");
                                const downloadLink = document.createElement("a");
                                downloadLink.href = pngUrl;
                                downloadLink.download = `${newQrSlug || "qr"}.png`;
                                document.body.appendChild(downloadLink);
                                downloadLink.click();
                                document.body.removeChild(downloadLink);
                              };
                              img.src = "data:image/svg+xml;base64," + btoa(svgData);
                            }}
                            className="flex items-center justify-center gap-3 bg-black text-white px-6 py-3 rounded-lg font-bold text-[10px] uppercase tracking-widest cred-button-tactile"
                          >
                            <Download className="w-4 h-4" />
                            PNG
                          </button>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${appUrl}/r/${newQrSlug || editingQr?.slug}`);
                          showToast("Endpoint address secured.");
                        }}
                        className="flex items-center justify-center gap-3 bg-white border border-slate-200 text-black px-6 py-3 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                      >
                        <Copy className="w-4 h-4" />
                        URL
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isFolderModalOpen && (
          <div key="modal-folder" className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFolderModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md relative z-60 border border-slate-200 shadow-2xl p-10 rounded-xl"
            >
              <div className="mb-8">
                <h2 className="text-3xl text-black mb-2">{editingFolder ? "Modify Sector" : "New Sector"}</h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400">Archive Space Allocation</p>
              </div>

              <form onSubmit={handleCreateFolder} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Sector Name</label>
                  <input 
                    required
                    type="text" 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. Executive Archive"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:ring-0 focus:border-black outline-none text-sm text-black placeholder:text-slate-300 transition-all"
                  />
                </div>

                <div className="flex gap-4">
                  <button 
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setFolderModalOpen(false);
                      setEditingFolder(null);
                      setNewFolderName("");
                    }}
                    className="flex-1 border border-slate-200 text-slate-400 py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.3em] hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-black text-white py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.3em] cred-button-tactile transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {editingFolder ? "Secure changes" : "Confirm Allocation"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isFolderShareModalOpen && sharingFolder && (
          <div key="modal-folder-share" className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFolderShareModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md relative z-60 border border-slate-200 shadow-2xl p-10 rounded-xl"
            >
              <div className="mb-8">
                <h2 className="text-3xl text-black mb-2">Team Collaboration</h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400">Share Sector: {sharingFolder.name}</p>
              </div>

              <form onSubmit={handleSaveFolderShare} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Collaborator Emails</label>
                  <textarea 
                    value={folderManagersEmails}
                    onChange={(e) => setFolderManagersEmails(e.target.value)}
                    placeholder="teammate@example.com, developer@it.pune"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:ring-0 focus:border-black outline-none text-sm text-black placeholder:text-slate-300 transition-all h-32 resize-none"
                  />
                  <p className="text-[8px] text-slate-400 uppercase tracking-widest leading-relaxed">
                    Identities listed here will be granted management permissions to this sector and all artifacts within it.
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setFolderShareModalOpen(false)}
                    className="flex-1 border border-slate-200 text-slate-400 py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.3em] hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-black text-white py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.3em] cred-button-tactile transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    Confirm Protocol
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isShareModalOpen && sharingQr && (
          <div key="modal-share" className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShareModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md relative z-60 border border-slate-200 shadow-2xl p-10 rounded-xl"
            >
              <div className="mb-8">
                <h2 className="text-3xl text-black mb-2">Access Control</h2>
                <p className="text-[9px] uppercase tracking-[0.3em] text-slate-400">Share Resource Protocol</p>
              </div>

              <form onSubmit={handleSaveShare} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Visibility</label>
                  <div className="flex bg-slate-50 border border-slate-200 p-1 rounded-lg">
                    <button 
                      type="button"
                      onClick={() => setShareVisibility('public')}
                      className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all", shareVisibility === 'public' ? "bg-black text-white shadow-lg" : "text-slate-400 hover:text-black")}
                    >
                      Public
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShareVisibility('restricted')}
                      className={cn("flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all", shareVisibility === 'restricted' ? "bg-black text-white shadow-lg" : "text-slate-400 hover:text-black")}
                    >
                      Restricted
                    </button>
                  </div>
                </div>

                {shareVisibility === 'restricted' && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Whitelist Emails</label>
                    <textarea 
                      value={shareEmails}
                      onChange={(e) => setShareEmails(e.target.value)}
                      placeholder="email1@example.com, email2@example.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:ring-0 focus:border-black outline-none text-sm text-black placeholder:text-slate-300 transition-all h-24 resize-none"
                    />
                    <p className="text-[8px] text-slate-400 uppercase tracking-widest leading-relaxed">
                      Only the owner and these verified identities will be granted access signal.
                    </p>
                  </div>
                )}

                <div className="space-y-6 pt-4">
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Direct Signal Link</p>
                    <div className="flex items-center gap-3">
                      <input 
                        readOnly
                        value={`${appUrl}/r/${sharingQr.slug}`}
                        className="flex-1 bg-white border border-slate-200 rounded px-3 py-2 text-[10px] font-mono text-black outline-none"
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${appUrl}/r/${sharingQr.slug}`);
                          showToast("Signal link copied");
                        }}
                        className="p-2 bg-black text-white rounded-lg hover:scale-110 active:scale-95 transition-transform"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => {
                        window.location.href = `mailto:?subject=Secure Access: ${sharingQr.name}&body=You have been granted access to the following secure protocol: ${appUrl}/r/${sharingQr.slug}`;
                      }}
                      className="flex-1 border border-slate-200 text-slate-400 py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.3em] hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Email
                    </button>
                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 bg-black text-white py-4 rounded-sm font-bold text-[10px] uppercase tracking-[0.3em] cred-button-tactile transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      Finalise
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isProfileModalOpen && (
          <div key="modal-profile" className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProfileModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-lg"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 40 }}
              className="bg-white w-full max-w-md relative z-60 border border-slate-200 shadow-2xl p-10 rounded-xl"
            >
              <div className="relative mb-10 overflow-hidden rounded-xl bg-slate-50 p-8 border border-slate-100">
                <div className="cred-gradient-reward absolute inset-0 opacity-20 pointer-events-none" />
                <h2 className="text-2xl text-black mb-1">Club Identity</h2>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.3em]">Credentials verification</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Full Legal Name</label>
                  <input 
                    required
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 text-sm focus:border-black outline-none transition-all text-black placeholder:text-slate-300"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Contact Protocol</label>
                  <input 
                    required
                    type="email" 
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Enter secure email"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 text-sm focus:border-black outline-none transition-all text-black placeholder:text-slate-300"
                  />
                </div>
                <button 
                  disabled={isSubmitting}
                  className="w-full bg-black text-white py-5 rounded-sm font-bold text-xs uppercase tracking-[0.3em] cred-button-tactile mb-2 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Verify Credentials
                </button>
                <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest opacity-60">Identity secured by AIT Pune protocol</p>
              </form>
            </motion.div>
          </div>
        )}
        {/* Scanner Modal */}
        {isScannerOpen && (
          <div key="modal-scanner" className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsScannerOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white w-full max-w-lg relative z-10 p-8 rounded-2xl overflow-hidden"
            >
              <div className="mb-6 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">Scanning Protocol</h2>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400">Position QR within frame</p>
                </div>
                <button 
                  onClick={() => setIsScannerOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div id="reader" className="w-full overflow-hidden rounded-xl border-4 border-slate-50" />
              
              <div className="mt-6 p-4 bg-slate-50 rounded-xl flex items-center gap-4">
                <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                  <Scan className="text-white w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold">Active Optical Reader</p>
                  <p className="text-[10px] text-slate-400">Decoding real-time spatial data streams</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Toast System */}
        <AnimatePresence key="presence-toast">
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "fixed bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-3 z-[2000] shadow-2xl glass-morphism",
                toast.type === "success" ? "bg-black text-white" : "bg-red-500 text-white"
              )}
            >
              {toast.type === "success" ? (
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              ) : (
                <X className="w-4 h-4" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Custom Delete Confirmation Modal --- */}
        <AnimatePresence key="presence-delete">
          {deleteConfirm && (
            <div key="modal-delete" className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDeleteConfirm(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white w-full max-w-sm relative z-[1010] border border-slate-200 shadow-2xl p-10 rounded-xl text-center"
              >
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-8">
                  <Trash2 className="w-10 h-10" />
                </div>
                <h2 className="text-2xl text-black mb-4 uppercase tracking-tighter font-bold">Purge Artifact?</h2>
                <p className="text-sm text-slate-400 leading-relaxed mb-10">
                  {deleteConfirm.type === 'bulk' 
                    ? `You are about to permanently delete ${Array.isArray(deleteConfirm.id) ? deleteConfirm.id.length : 0} resources. This operation is irreversible.`
                    : deleteConfirm.type === 'folder'
                    ? "Deleting this sector will also purge all artifacts contained within. Are you absolutely certain?"
                    : "This resource will be permanently removed from the central archive."}
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 py-4 border border-slate-200 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (deleteConfirm.type === 'bulk' && Array.isArray(deleteConfirm.id)) confirmBulkDelete(deleteConfirm.id);
                      else if (deleteConfirm.type === 'qr' && typeof deleteConfirm.id === 'string') confirmDeleteQr(deleteConfirm.id);
                      else if (deleteConfirm.type === 'folder' && typeof deleteConfirm.id === 'string') confirmDeleteFolder(deleteConfirm.id);
                    }}
                    className="flex-1 py-4 bg-red-500 text-white font-bold text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-red-600 transition-all shadow-lg active:scale-95"
                  >
                    Confirm Purge
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </AnimatePresence>
    </div>
  );
}
