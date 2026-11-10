from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    section_name = Column(String(100), default="General", nullable=False)
    description = Column(Text, nullable=True)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="categories")
    products = relationship("Product", back_populates="category")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    sku = Column(String(100), nullable=True, index=True)
    barcode = Column(String(100), nullable=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    unit = Column(String(20), default="piece", nullable=False)  # piece, kg, g, l, ml, packet, box
    purchase_cost = Column(Float, default=0.0, nullable=False)  # weighted average or latest purchase cost
    selling_price = Column(Float, default=0.0, nullable=False)
    tax_rate_percent = Column(Float, default=0.0, nullable=False)  # GST rate: 0, 5, 12, 18, 28
    current_stock = Column(Float, default=0.0, nullable=False)
    reorder_threshold = Column(Float, default=10.0, nullable=False)
    min_order_qty = Column(Float, default=5.0, nullable=False)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    business = relationship("Business", back_populates="products")
    category = relationship("Category", back_populates="products")
    supplier = relationship("Supplier", back_populates="products")
    batches = relationship("ProductBatch", back_populates="product", cascade="all, delete-orphan")
    stock_movements = relationship("StockMovement", back_populates="product", cascade="all, delete-orphan")
    invoice_items = relationship("InvoiceItem", back_populates="product")
    po_items = relationship("PurchaseOrderItem", back_populates="product")

class ProductBatch(Base):
    __tablename__ = "product_batches"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_number = Column(String(100), nullable=False)
    quantity = Column(Float, default=0.0, nullable=False)
    purchase_cost = Column(Float, default=0.0, nullable=False)
    expiry_date = Column(Date, nullable=True, index=True)
    received_date = Column(Date, default=date.today)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="batches")
