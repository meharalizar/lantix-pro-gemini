'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Star, MessageSquare, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

export function CrewReviewsSection({ crewId, company }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [openModal, setOpenModal] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadReviews = useCallback(async () => {
    if (!crewId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/reviews?crewId=${crewId}`)
      if (res.ok) {
        const data = await res.json()
        setReviews(data.reviews || [])
      }
    } catch {
      // safe fallback
    } finally {
      setLoading(false)
    }
  }, [crewId])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crewId, rating, comment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit review')
      toast.success('Review submitted successfully')
      setOpenModal(false)
      setComment('')
      loadReviews()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-violet-600" />
          <h4 className="font-semibold text-sm">Verified Production Reviews ({reviews.length})</h4>
        </div>
        {company && (
          <Button size="sm" variant="outline" onClick={() => setOpenModal(true)} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Leave Review
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-2">Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 bg-muted/20 rounded p-3 text-center">
          No verified reviews yet. Only production companies with completed, approved timesheets can leave reviews.
        </div>
      ) : (
        <div className="space-y-2.5">
          {reviews.map((r) => (
            <div key={r.id} className="p-3 rounded-lg border bg-muted/10 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium">
                  <span>{r.companyName || 'Verified Production Co.'}</span>
                  <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 font-normal py-0">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Verified Show
                  </Badge>
                </div>
                <div className="flex items-center text-amber-500 font-semibold">
                  {Array.from({ length: r.rating }).map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-amber-400" />
                  ))}
                  <span className="ml-1 text-[11px] text-foreground">{r.rating}.0</span>
                </div>
              </div>
              {r.comment && <p className="text-muted-foreground">{r.comment}</p>}
              <div className="text-[10px] text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave a Verified Production Review</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Rating (1 to 5 Stars)</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 focus:outline-none"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= rating ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Comments / Work Performance</label>
              <Textarea
                placeholder="Share your experience working with this technician on your show..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting} className="bg-violet-600 hover:bg-violet-700">
                {submitting ? 'Submitting...' : 'Post Verified Review'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
