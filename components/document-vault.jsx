'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Upload, ShieldCheck, Lock, Trash2, Download, AlertCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CATEGORIES = [
  { key: 'certifications', label: 'Certifications', sensitive: false },
  { key: 'ids', label: 'Government IDs', sensitive: true },
  { key: 'insurance', label: 'Proof of Insurance / COI', sensitive: false },
  { key: 'tax_w9', label: 'W-9 / Tax Documents', sensitive: true },
  { key: 'contracts', label: 'Contracts & Agreements', sensitive: true },
  { key: 'invoices', label: 'Invoices', sensitive: false },
  { key: 'show_documents', label: 'Show & Venue Documents', sensitive: false },
]

export default function DocumentVault({ user, companyId, isOwner = true }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('certifications')
  const [fileData, setFileData] = useState('')
  const [fileType, setFileType] = useState('application/pdf')
  const [uploading, setUploading] = useState(false)

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true)
      const url = activeCategory === 'all' ? '/api/documents' : `/api/documents?category=${activeCategory}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch {
      // safe fallback
    } finally {
      setLoading(false)
    }
  }, [activeCategory])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      toast.error('File exceeds 8MB limit')
      return
    }
    setFileType(file.type || 'application/octet-stream')
    if (!name) setName(file.name.replace(/\.[^/.]+$/, ''))
    const reader = new FileReader()
    reader.onload = (evt) => {
      setFileData(evt.target?.result || '')
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Document title is required')
      return
    }
    try {
      setUploading(true)
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          fileData,
          fileType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upload document')
      toast.success('Document uploaded to secure vault')
      setName('')
      setFileData('')
      setShowUpload(false)
      loadDocuments()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId) => {
    if (!window.confirm('Delete this document from the vault?')) return
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete document')
      toast.success('Document deleted')
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
              <CardTitle>Document Vault & Compliance</CardTitle>
            </div>
            <CardDescription>
              Secure repository for 7 compliance categories. Sensitive documents (IDs, W-9s, Contracts) are protected server-side.
            </CardDescription>
          </div>
          {isOwner && (
            <Button
              size="sm"
              onClick={() => setShowUpload(!showUpload)}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <Upload className="h-4 w-4 mr-1.5" />
              {showUpload ? 'Cancel' : 'Upload Document'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Form */}
        {showUpload && (
          <form onSubmit={handleUpload} className="p-4 rounded-lg border bg-muted/20 space-y-4">
            <div className="font-medium text-sm flex items-center gap-2">
              <Plus className="h-4 w-4 text-violet-600" />
              Upload to Secure Vault
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="doc-name">Document Title</Label>
                <Input
                  id="doc-name"
                  placeholder="e.g. 2026 W-9 Form"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-cat">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="doc-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label} {c.sensitive ? '🔒 (Sensitive)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-file">Select File (PDF, Image, Max 8MB)</Label>
                <Input
                  id="doc-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {CATEGORIES.find((c) => c.key === category)?.sensitive && (
              <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded border border-amber-200 flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0 text-amber-600" />
                <span>This document is classified as sensitive. It is encrypted and accessible only to you and approved administrators.</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowUpload(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={uploading} className="bg-violet-600 hover:bg-violet-700">
                {uploading ? 'Uploading...' : 'Save to Vault'}
              </Button>
            </div>
          </form>
        )}

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-1 border-b pb-3">
          <Button
            size="sm"
            variant={activeCategory === 'all' ? 'default' : 'outline'}
            className={activeCategory === 'all' ? 'bg-violet-600 hover:bg-violet-700' : ''}
            onClick={() => setActiveCategory('all')}
          >
            All Categories
          </Button>
          {CATEGORIES.map((c) => (
            <Button
              key={c.key}
              size="sm"
              variant={activeCategory === c.key ? 'default' : 'outline'}
              className={activeCategory === c.key ? 'bg-violet-600 hover:bg-violet-700' : ''}
              onClick={() => setActiveCategory(c.key)}
            >
              {c.sensitive && <Lock className="h-3 w-3 mr-1 text-amber-500" />}
              {c.label}
            </Button>
          ))}
        </div>

        {/* Documents List */}
        {loading ? (
          <div className="text-xs text-muted-foreground py-6 text-center">Loading vault documents...</div>
        ) : documents.length === 0 ? (
          <div className="text-xs text-muted-foreground py-8 text-center border border-dashed rounded-lg space-y-2">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <div>No documents uploaded in this category.</div>
            <div className="text-[11px] text-muted-foreground">Upload certifications, IDs, insurance certificates, or contracts to keep compliance up to date.</div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => {
              const catInfo = CATEGORIES.find((c) => c.key === doc.category)
              return (
                <div key={doc.id} className="p-3.5 rounded-lg border bg-card hover:border-violet-300 transition-colors flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm line-clamp-1">{doc.name}</div>
                      {doc.sensitive && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 shrink-0 flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5" /> Sensitive
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {catInfo?.label || doc.category}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Added: {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                    {doc.fileData ? (
                      <a
                        href={doc.fileData}
                        download={doc.name}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-violet-600 hover:underline font-medium"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">Metadata record</span>
                    )}

                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
