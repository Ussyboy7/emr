"use client";

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Image as ImageIcon, Search, ZoomIn, ZoomOut, RotateCw, Contrast, 
  Maximize, Grid, Ruler, Move, Download, Share2
} from 'lucide-react';

const recentStudies = [
  { id: 'RAD-001', patient: 'Adebayo Johnson', modality: 'X-Ray', bodyPart: 'Chest', date: '2024-11-27', images: 2 },
  { id: 'RAD-002', patient: 'Fatima Mohammed', modality: 'Ultrasound', bodyPart: 'Abdomen', date: '2024-11-27', images: 12 },
  { id: 'RAD-003', patient: 'Chukwu Emeka', modality: 'CT Scan', bodyPart: 'Head', date: '2024-11-27', images: 45 },
  { id: 'RAD-004', patient: 'Grace Okonkwo', modality: 'X-Ray', bodyPart: 'Lumbar Spine', date: '2024-11-26', images: 3 },
];

export default function ImageViewerPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudy, setSelectedStudy] = useState<typeof recentStudies[0] | null>(null);

  const filteredStudies = recentStudies.filter(study =>
    study.patient.toLowerCase().includes(searchQuery.toLowerCase()) || study.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                  {filteredStudies.map((study) => (
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
                  ))}
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
                    <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm"><Share2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm"><Maximize className="h-4 w-4" /></Button>
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

