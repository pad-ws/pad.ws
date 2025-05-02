"""
Backup service for business logic related to backups.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..repository import BackupRepository, PadRepository

class BackupService:
    """Service for backup-related business logic"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the service with a database session"""
        self.session = session
        self.repository = BackupRepository(session)
        self.pad_repository = PadRepository(session)
    
    async def create_backup(self, source_id: UUID, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new backup"""
        # Validate input
        if not data:
            raise ValueError("Backup data is required")
        
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        # Create backup
        backup = await self.repository.create(source_id, data)
        return backup.to_dict()
    
    async def get_backup(self, backup_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a backup by ID"""
        backup = await self.repository.get_by_id(backup_id)
        return backup.to_dict() if backup else None
    
    async def get_backups_by_source(self, source_id: UUID) -> List[Dict[str, Any]]:
        """Get all backups for a specific source pad"""
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        backups = await self.repository.get_by_source(source_id)
        return [backup.to_dict() for backup in backups]
    
    async def get_latest_backup(self, source_id: UUID) -> Optional[Dict[str, Any]]:
        """Get the most recent backup for a specific source pad"""
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        backup = await self.repository.get_latest_by_source(source_id)
        return backup.to_dict() if backup else None
    
    async def get_backups_by_date_range(self, source_id: UUID, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Get backups for a specific source pad within a date range"""
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        # Validate date range
        if start_date > end_date:
            raise ValueError("Start date must be before end date")
        
        backups = await self.repository.get_by_date_range(source_id, start_date, end_date)
        return [backup.to_dict() for backup in backups]
    
    async def delete_backup(self, backup_id: UUID) -> bool:
        """Delete a backup"""
        # Get the backup to check if it exists
        backup = await self.repository.get_by_id(backup_id)
        if not backup:
            raise ValueError(f"Backup with ID '{backup_id}' does not exist")
        
        return await self.repository.delete(backup_id)
    
    async def manage_backups(self, source_id: UUID, max_backups: int = 10) -> int:
        """Manage backups for a source pad, keeping only the most recent ones"""
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        # Validate max_backups
        if max_backups < 1:
            raise ValueError("Maximum number of backups must be at least 1")
        
        # Count current backups
        backup_count = await self.repository.count_by_source(source_id)
        
        # If we have more backups than the maximum, delete the oldest ones
        if backup_count > max_backups:
            return await self.repository.delete_older_than(source_id, max_backups)
        
        return 0  # No backups deleted
