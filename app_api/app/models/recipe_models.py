from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


ALLOWED_QA_STATUSES = ("passed", "manual_review", "failed")


class Base(DeclarativeBase):
    pass


class Recipe(Base):
    __tablename__ = "recipes"

    recipe_id: Mapped[str] = mapped_column(Text, primary_key=True)
    recipe_name: Mapped[str] = mapped_column(Text, nullable=False)
    category_lv1: Mapped[str] = mapped_column(Text, nullable=False)
    category_lv2: Mapped[str] = mapped_column(Text, nullable=False)
    category_lv3: Mapped[str | None] = mapped_column(Text, nullable=True)
    energy_kcal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    protein_g: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fat_g: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    carbohydrate_g: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    p_ratio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    f_ratio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    c_ratio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    cooking_method: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_file: Mapped[str] = mapped_column(Text, nullable=False)
    source_batch: Mapped[str] = mapped_column(Text, nullable=False)
    qa_status: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
    )
    steps: Mapped[list["RecipeStep"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("energy_kcal >= 0", name="ck_recipes_energy_non_negative"),
        CheckConstraint("protein_g >= 0", name="ck_recipes_protein_non_negative"),
        CheckConstraint("fat_g >= 0", name="ck_recipes_fat_non_negative"),
        CheckConstraint("carbohydrate_g >= 0", name="ck_recipes_carbohydrate_non_negative"),
        CheckConstraint("p_ratio >= 0", name="ck_recipes_p_ratio_non_negative"),
        CheckConstraint("f_ratio >= 0", name="ck_recipes_f_ratio_non_negative"),
        CheckConstraint("c_ratio >= 0", name="ck_recipes_c_ratio_non_negative"),
        CheckConstraint(
            "qa_status IN ('passed', 'manual_review', 'failed')",
            name="ck_recipes_qa_status",
        ),
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recipe_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("recipes.recipe_id", ondelete="CASCADE"),
        nullable=False,
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    ingredient_name: Mapped[str] = mapped_column(Text, nullable=False)
    ingredient_alias: Mapped[str | None] = mapped_column(Text, nullable=True)
    weight_g: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    amount_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    unit: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_file: Mapped[str] = mapped_column(Text, nullable=False)
    source_batch: Mapped[str] = mapped_column(Text, nullable=False)
    qa_status: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[str] = mapped_column(Text, nullable=False)

    recipe: Mapped[Recipe] = relationship(back_populates="ingredients")

    __table_args__ = (
        UniqueConstraint("recipe_id", "line_no", name="uq_recipe_ingredients_recipe_line_no"),
        CheckConstraint("line_no >= 1", name="ck_recipe_ingredients_line_no_positive"),
        CheckConstraint("weight_g IS NULL OR weight_g > 0", name="ck_recipe_ingredients_weight_positive"),
        CheckConstraint("amount_value IS NULL OR amount_value > 0", name="ck_recipe_ingredients_amount_value_positive"),
        CheckConstraint("unit IS NULL OR unit IN ('g', 'ml')", name="ck_recipe_ingredients_unit"),
        CheckConstraint(
            "qa_status IN ('passed', 'manual_review', 'failed')",
            name="ck_recipe_ingredients_qa_status",
        ),
    )


class RecipeStep(Base):
    __tablename__ = "recipe_steps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recipe_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("recipes.recipe_id", ondelete="CASCADE"),
        nullable=False,
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    source_file: Mapped[str] = mapped_column(Text, nullable=False)
    source_batch: Mapped[str] = mapped_column(Text, nullable=False)
    qa_status: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[str] = mapped_column(Text, nullable=False)

    recipe: Mapped[Recipe] = relationship(back_populates="steps")

    __table_args__ = (
        UniqueConstraint("recipe_id", "step_number", name="uq_recipe_steps_recipe_step_number"),
        CheckConstraint("step_number >= 1", name="ck_recipe_steps_step_number_positive"),
        CheckConstraint(
            "qa_status IN ('passed', 'manual_review', 'failed')",
            name="ck_recipe_steps_qa_status",
        ),
    )
