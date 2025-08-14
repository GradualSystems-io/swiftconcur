
/**
 * R2 storage service for archiving raw xcresult files
 */
export class R2Service {
  private bucket: R2Bucket;
  
  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }
  
  /**
   * Upload file to R2 with metadata
   */
  async uploadFile(
    key: string,
    file: File | ArrayBuffer | Uint8Array,
    metadata?: Record<string, string>
  ): Promise<void> {
    try {
      const options: R2PutOptions = {
        httpMetadata: {
          contentType: file instanceof File ? file.type : 'application/json',
          contentLanguage: 'en',
        },
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          ...metadata,
        },
      };
      
      const data = file instanceof File ? await file.arrayBuffer() : file;
      
      await this.bucket.put(key, data, options);
      
    } catch (error) {
      console.error('Error uploading to R2:', error);
      throw new Error(`Failed to upload file: ${error}`);
    }
  }
  
  /**
   * Download file from R2
   */
  async downloadFile(key: string): Promise<R2ObjectBody | null> {
    try {
      const object = await this.bucket.get(key);
      return object;
      
    } catch (error) {
      console.error('Error downloading from R2:', error);
      throw new Error(`Failed to download file: ${error}`);
    }
  }
  
  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const object = await this.bucket.head(key);
      return object !== null;
      
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  }
  
  /**
   * Delete file from R2
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.bucket.delete(key);
      
    } catch (error) {
      console.error('Error deleting from R2:', error);
      throw new Error(`Failed to delete file: ${error}`);
    }
  }
  
  /**
   * List files with prefix
   */
  async listFiles(prefix: string, limit: number = 1000): Promise<R2Objects> {
    try {
      const objects = await this.bucket.list({
        prefix,
        limit,
      });
      
      return objects;
      
    } catch (error) {
      console.error('Error listing R2 objects:', error);
      throw new Error(`Failed to list files: ${error}`);
    }
  }
  
  /**
   * Get file metadata without downloading content
   */
  async getFileMetadata(key: string): Promise<R2Object | null> {
    try {
      const object = await this.bucket.head(key);
      return object;
      
    } catch (error) {
      console.error('Error getting file metadata:', error);
      return null;
    }
  }
  
  /**
   * Generate presigned URL for direct upload (if needed for large files)
   */
  async generatePresignedUploadUrl(
    _key: string,
    _expiresIn: number = 3600 // 1 hour
  ): Promise<string> {
    // Note: Cloudflare R2 doesn't support presigned URLs in the same way as S3
    // This would need to be implemented using Cloudflare's API or Workers
    throw new Error('Presigned URLs not implemented for R2');
  }
  
  /**
   * Cleanup old files for a repository
   */
  async cleanupOldFiles(repoId: string, keepCount: number): Promise<number> {
    try {
      const prefix = `${repoId}/`;
      const objects = await this.listFiles(prefix);
      
      if (!objects.objects || objects.objects.length <= keepCount) {
        return 0;
      }
      
      // Sort by upload date (newest first)
      const sortedObjects = objects.objects.sort((a, b) => 
        new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime()
      );
      
      // Delete objects beyond the keep count
      const objectsToDelete = sortedObjects.slice(keepCount);
      let deletedCount = 0;
      
      for (const obj of objectsToDelete) {
        try {
          await this.deleteFile(obj.key);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete object ${obj.key}:`, error);
        }
      }
      
      return deletedCount;
      
    } catch (error) {
      console.error('Error cleaning up old files:', error);
      throw error;
    }
  }
  
  /**
   * Get storage usage for a repository
   */
  async getStorageUsage(repoId: string): Promise<{
    fileCount: number;
    totalSize: number;
    oldestFile: Date | null;
    newestFile: Date | null;
  }> {
    try {
      const prefix = `${repoId}/`;
      const objects = await this.listFiles(prefix);
      
      if (!objects.objects || objects.objects.length === 0) {
        return {
          fileCount: 0,
          totalSize: 0,
          oldestFile: null,
          newestFile: null,
        };
      }
      
      const totalSize = objects.objects.reduce((sum, obj) => sum + obj.size, 0);
      const dates = objects.objects.map(obj => new Date(obj.uploaded));
      
      return {
        fileCount: objects.objects.length,
        totalSize,
        oldestFile: new Date(Math.min(...dates.map(d => d.getTime()))),
        newestFile: new Date(Math.max(...dates.map(d => d.getTime()))),
      };
      
    } catch (error) {
      console.error('Error getting storage usage:', error);
      return {
        fileCount: 0,
        totalSize: 0,
        oldestFile: null,
        newestFile: null,
      };
    }
  }
}

/**
 * Helper function to upload warnings file to R2
 */
export async function uploadToR2(
  bucket: R2Bucket,
  key: string,
  file: File,
  metadata?: Record<string, string>
): Promise<void> {
  const r2Service = new R2Service(bucket);
  await r2Service.uploadFile(key, file, metadata);
}

/**
 * Helper function to generate R2 key for warnings file
 */
export function generateWarningsKey(repoId: string, runId: string): string {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${repoId}/${timestamp}/${runId}/warnings.json`;
}

/**
 * Helper function to generate R2 key for xcresult bundle
 */
export function generateXCResultKey(repoId: string, runId: string): string {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${repoId}/${timestamp}/${runId}/build.xcresult`;
}