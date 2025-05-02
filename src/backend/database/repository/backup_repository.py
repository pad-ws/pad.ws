"""
Backup repository for database operations related to backups.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, func

from ..models import BackupModel

class BackupRepository:
    """Repository for backup-related database operations"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the repository with a database session"""
        self.session = session
    
    async def create(self, source_id: UUID, data: Dict[str, Any]) -> BackupModel:
        """Create a new backup"""
        backup = BackupModel(source_id=source_id, data=data)
        self.session.add(backup)
        await self.session.commit()
        await self.session.refresh(backup)
        return backup
    
    async def get_by_id(self, backup_id: UUID) -> Optional[BackupModel]:
        """Get a backup by ID"""
        stmt = select(BackupModel).where(BackupModel.id == backup_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def get_by_source(self, source_id: UUID) -> List[BackupModel]:
        """Get all backups for a specific source pad"""
        stmt = select(BackupModel).where(BackupModel.source_id == source_id).order_by(BackupModel.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def get_latest_by_source(self, source_id: UUID) -> Optional[BackupModel]:
        """Get the most recent backup for a specific source pad"""
        stmt = select(BackupModel).where(BackupModel.source_id == source_id).order_by(BackupModel.created_at.desc()).limit(1)
        result = await self.session.execute(stmt)
        return result.scalars().first()
    
    async def get_by_date_range(self, source_id: UUID, start_date: datetime, end_date: datetime) -> List[BackupModel]:
        """Get backups for a specific source pad within a date range"""
        stmt = select(BackupModel).where(
            BackupModel.source_id == source_id,
            BackupModel.created_at >= start_date,
            BackupModel.created_at <= end_date
        ).order_by(BackupModel.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def delete(self, backup_id: UUID) -> bool:
        """Delete a backup"""
        stmt = delete(BackupModel).where(BackupModel.id == backup_id)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount > 0
    
    async def delete_older_than(self, source_id: UUID, keep_count: int) -> int:
        """Delete older backups, keeping only the most recent ones"""
        # Get the created_at timestamp of the backup at position keep_count
        subquery = select(BackupModel.created_at).where(
            BackupModel.source_id == source_id
        ).order_by(BackupModel.created_at.desc()).offset(keep_count).limit(1)
        
        result = await self.session.execute(subquery)
        cutoff_date = result.scalar()
        
        if not cutoff_date:
            return 0  # Not enough backups to delete any
        
        # Delete backups older than the cutoff date
        stmt = delete(BackupModel).where(
            BackupModel.source_id == source_id,
            BackupModel.created_at < cutoff_date
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount
    
    async def count_by_source(self, source_id: UUID) -> int:
        """Count the number of backups for a specific source pad"""
        stmt = select(func.count()).select_from(BackupModel).where(BackupModel.source_id == source_id)
        result = await self.session.execute(stmt)
        return result.scalar()
