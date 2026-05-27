-- ========================================
-- 账单管家 - Supabase 数据库初始化脚本
-- 在 Supabase Dashboard → SQL Editor 中运行
-- ========================================

-- 1. 创建 receipts 表（账单主表）
CREATE TABLE IF NOT EXISTS receipts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_name TEXT DEFAULT '',
  store_address TEXT DEFAULT '',
  receipt_date TEXT DEFAULT '',
  receipt_time TEXT DEFAULT '',
  total_amount REAL DEFAULT 0,
  subtotal REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  payment_method TEXT DEFAULT '',
  receipt_number TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建 receipt_items 表（商品明细）
CREATE TABLE IF NOT EXISTS receipt_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id BIGINT REFERENCES receipts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  name_cn TEXT DEFAULT '',
  name_en TEXT DEFAULT '',
  brand_name TEXT DEFAULT '',
  quantity REAL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  category_name TEXT DEFAULT '其他',
  discount_amount REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipts_store ON receipts(store_name);
CREATE INDEX IF NOT EXISTS idx_items_receipt ON receipt_items(receipt_id);

-- 4. 创建存储桶用于保存小票图片
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('receipt_images', 'receipt_images', true, false)
ON CONFLICT (id) DO NOTHING;

-- 5. 允许公开访问存储桶
CREATE POLICY "Public Access"
ON storage.objects FOR ALL
USING (bucket_id = 'receipt_images')
WITH CHECK (bucket_id = 'receipt_images');

-- 6. 开启 receipts 的 RLS 并允许公开访问（单用户模式）
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Access" ON receipts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public Access" ON receipt_items
  FOR ALL USING (true) WITH CHECK (true);

-- ========================================
-- 迁移：为已存在的数据库添加新字段
-- 如果表已存在且缺少字段，运行以下 SQL
-- ========================================
ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS name_cn TEXT DEFAULT '';
ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '';
ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS brand_name TEXT DEFAULT '';
