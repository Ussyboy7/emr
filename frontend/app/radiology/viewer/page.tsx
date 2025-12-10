"use client";

import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { radiologyService } from '@/lib/services';
import { 
  Image as ImageIcon, Search, ZoomIn, ZoomOut, RotateCw, Contrast, 
  Maximize, Grid, Ruler, Move, Download, Share2, Loader2, AlertTriangle
} from 'lucide-react';

interface StudyWithImages {
  id: string;
  patient: string;
  modality: string;
  bodyPart: string;
  date: string;
  images: number;
}

export default function ImageViewerPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudy, setSelectedStudy] = useState<StudyWithImages | null>(null);
  const [studies, setStudies] = useState<StudyWithImages[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStudies();
  }, []);

  const loadStudies = async () => {
    try {
      setLoading(true);
      setError(null);
      // Use the service method to get studies with images
      const response = await radiologyService.getStudiesWithImages({ page: 1 });
      
      const studiesWithImages: StudyWithImages[] = response.results.map(study => {
        // Get order info from the study if available, or use defaults
        const order = (study as any).order_details || {};
        const acquiredDate = study.acquired_at 
          ? new Date(study.acquired_at).toISOString().split('T')[0] 
          : (study as any).created_at 
          ? new Date((study as any).created_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        
        return {
          id: study.id.toString(),
          patient: order.patient_name || (study as any).patient_name || 'Unknown',
          modality: study.modality || 'X-Ray',
          bodyPart: study.body_part || '',
          date: acquiredDate,
          images: study.images_count || 0,
        };
      });
      
      // Sort by date (most recent first)
      studiesWithImages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setStudies(studiesWithImages);
    } catch (err: any) {
      setError(err.message || 'Failed to load studies');
      console.error('Error loading studies:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudies = useMemo(() => studies.filter(study =>
    study.patient.toLowerCase().includes(searchQuery.toLowerCase()) || 
    study.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    study.modality.toLowerCase().includes(searchQuery.toLowerCase())
  ), [studies, searchQuery]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Image Viewer</h1>
          <p className="text-muted-foreground mt-1">View and analyze medical images</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Study List */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Studies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {loading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Loading studies...</p>
                    </div>
                  ) : error ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={loadStudies}>Retry</Button>
                    </div>
                  ) : filteredStudies.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No studies found</p>
                    </div>
                  ) : (
                    filteredStudies.map((study) => (
                    <div 
                      key={study.id} 
                      onClick={() => setSelectedStudy(study)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedStudy?.id === study.id ? 'border-cyan-500 bg-cyan-500/10' : 'hover:border-cyan-500/50 hover:bg-muted/50'}`}
                    >
                      <p className="font-medium text-foreground text-sm">{study.patient}</p>
                      <p className="text-xs text-muted-foreground">{study.id}</p>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="outline" className="text-xs">{study.modality}</Badge>
                        <span className="text-xs text-muted-foreground">{study.images} images</span>
                      </div>
                    </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Image Viewer */}
          <div className="lg:col-span-3 space-y-4">
            {/* Toolbar */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm"><ZoomIn className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm"><ZoomOut className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm"><RotateCw className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm"><Contrast className="h-4 w-4" /></Button>
                    <div className="w-px h-6 bg-border mx-2" />
                    <Button variant="ghost" size="sm"><Move className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm"><Ruler className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm"><Grid className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => toast.info('Download requires DICOM/PACS integration')}
                      title="Download Images"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => toast.info('Share requires integration setup')}
                      title="Share"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => toast.info('Full screen viewer requires DICOM viewer integration')}
                      title="Full Screen"
                    >
                      <Maximize className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Viewer Area */}
            <Card className="min-h-[500px]">
              <CardContent className="p-6 h-full">
                {selectedStudy ? (
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-medium text-foreground">{selectedStudy.patient}</p>
                        <p className="text-sm text-muted-foreground">{selectedStudy.modality} - {selectedStudy.bodyPart} • {selectedStudy.date}</p>
                      </div>
                      <Badge variant="outline">{selectedStudy.images} images</Badge>
                    </div>
                    <div className="flex-1 rounded-lg bg-black/90 flex items-center justify-center">
                      <div className="text-center text-white/60">
                        <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">DICOM Viewer</p>
                        <p className="text-sm mt-2">Medical images would be displayed here</p>
                        <p className="text-xs mt-1 text-white/40">PACS integration required for actual image viewing</p>
                      </div>
                    </div>
                    {/* Thumbnail Strip */}
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                      {Array.from({ length: Math.min(selectedStudy.images, 8) }).map((_, i) => (
                        <div key={i} className={`w-16 h-16 rounded border-2 bg-black/50 flex items-center justify-center shrink-0 cursor-pointer ${i === 0 ? 'border-cyan-500' : 'border-transparent hover:border-cyan-500/50'}`}>
                          <span className="text-xs text-white/50">{i + 1}</span>
                        </div>
                      ))}
                      {selectedStudy.images > 8 && (
                        <div className="w-16 h-16 rounded border-2 border-transparent bg-muted/50 flex items-center justify-center shrink-0">
                          <span className="text-xs text-muted-foreground">+{selectedStudy.images - 8}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Select a Study</p>
                      <p className="text-sm mt-2">Choose a study from the list to view images</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

