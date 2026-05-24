-- Migration 028 UP: spots.image_url 추가
-- VisitJeju repPhoto.imgpath (원본 고해상도) 저장용.
-- thumbnailUrl은 리스트 썸네일 유지, imageUrl은 발견 피드·상세 전용.
ALTER TABLE spots ADD COLUMN IF NOT EXISTS image_url TEXT;
