/**
 * END-TO-END FLOW: Question Image Upload
 * 
 * This document traces the complete flow of a question image upload
 * before and after the fix.
 */

// ============================================================================
// STEP 1: Frontend - User selects image
// ============================================================================
// File: src/features/questions/components/question-form.tsx
// Event: User selects a PNG image file

const selectedFile = new File(["image_bytes"], "question.png", {
  type: "image/png",
});

// Verify it's a real File
console.assert(selectedFile instanceof File, "✓ Real File object");
console.assert(selectedFile.name === "question.png", "✓ Correct filename");
console.assert(selectedFile.size > 0, "✓ File has content");

// ============================================================================
// STEP 2: Form Submission - useQuestionForm hook
// ============================================================================
// File: src/features/questions/hooks/use-question-form.ts

const imageActions = useQuestionImageActions();
await imageActions.upload({
  id: "question-1",
  file: selectedFile,
});

// ============================================================================
// STEP 3: Question Actions - useQuestionImageActions hook
// ============================================================================
// File: src/features/questions/hooks/use-questions.ts

const upload = useQuestionsUploadImage();
upload.mutateAsync({
  id: "question-1",
  data: { file: selectedFile }, // ← File object passed here
});

// ============================================================================
// STEP 4: Generated Orval Client - questionsUploadImage
// ============================================================================
// File: src/api/generated/admin-questions/admin-questions.ts (generated)

const formData = new FormData();
formData.append("file", selectedFile); // ← Correct field name

// Generated request config:
const config = {
  url: "/admin/questions/question-1/media/image",
  method: "POST",
  headers: { "Content-Type": "multipart/form-data" }, // ← Will be removed
  data: formData, // ← Real FormData with File
};

return orvalMutator(config);

// ============================================================================
// STEP 5: orvalMutator - Prepare for apiClient
// ============================================================================
// File: src/api/orval-mutator.ts

export async function orvalMutator(config, options) {
  const headers = AxiosHeaders.from({
    ...config.headers, // Contains "Content-Type": "multipart/form-data"
    ...options?.headers,
  });

  const data = options?.data ?? config.data; // ← FormData object

  // CRITICAL FIX: Detect FormData and remove the explicit Content-Type
  if (data instanceof FormData) {
    headers.delete("Content-Type"); // ← Delete so Axios can add boundary
  }

  // CRITICAL FIX: Explicitly pass the data to ensure it's preserved
  const response = await apiClient.request({
    ...config,
    ...options,
    headers, // Now has no Content-Type
    data, // FormData is explicitly passed
  });

  return response.data;
}

// After this step:
// - headers has NO "Content-Type" entry
// - data is still FormData with "file" field
// - FormData instanceof check = true

// ============================================================================
// STEP 6: apiClient Request Interceptor - Handle Defaults
// ============================================================================
// File: src/lib/api/client.ts

apiClient.interceptors.request.use((config) => {
  // Add auth
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // CRITICAL FIX: Remove default JSON Content-Type for FormData
  if (config.data instanceof FormData) {
    config.headers.delete("Content-Type"); // ← Remove default JSON header
    // Now Axios/browser will auto-add: Content-Type: multipart/form-data; boundary=...
  }

  return config;
});

// After interceptor:
// - headers.Authorization = "Bearer token123"
// - headers.Content-Type is NOT set (will be auto-generated)
// - data is still FormData with "file" field
// - data instanceof FormData = true

// ============================================================================
// STEP 7: Axios Request - Browser Auto-Adds Boundary
// ============================================================================
// Axios sees:
// - data: FormData
// - headers.Content-Type: undefined

// Browser/Axios automatically:
// - Calculates multipart boundary
// - Adds: "Content-Type: multipart/form-data; boundary=----WebKitFormBoundary..."
// - Serializes FormData correctly

// Final HTTP Request Headers:
// {
//   "Content-Type": "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW",
//   "Authorization": "Bearer token123"
// }

// Final HTTP Request Body:
// ------WebKitFormBoundary7MA4YWxkTrZu0gW
// Content-Disposition: form-data; name="file"; filename="question.png"
// Content-Type: image/png
//
// [binary image data]
// ------WebKitFormBoundary7MA4YWxkTrZu0gW--

// ============================================================================
// STEP 8: Backend - Multer Receives Request
// ============================================================================
// File: src/modules/questions/questions.controller.ts

@Post(':id/media/image')
@UseInterceptors(FileInterceptor('file', {...}))
async uploadImage(
  @Param('id') id: string,
  @UploadedFile() file: UploadedImageFile, // ← File is populated!
) {
  if (!file) {
    // This NO LONGER happens because file is properly received
    throw new BadRequestException({
      code: 'QUESTION_IMAGE_FILE_REQUIRED',
      message: 'An image file is required.',
    });
  }

  // ✓ File is successfully uploaded
  return this.mutations.uploadImage(id, file);
}

// ============================================================================
// SUMMARY OF THE FIX
// ============================================================================
//
// BEFORE FIX:
// 1. FormData created with "file" field ✓
// 2. Content-Type set to "multipart/form-data" in generated code ✓
// 3. orvalMutator tried to delete Content-Type but didn't pass data explicitly ✗
// 4. apiClient had default "Content-Type: application/json" ✗
// 5. Axios merged defaults and request got JSON Content-Type ✗
// 6. Multer didn't recognize it as multipart ✗
// 7. File was undefined ✗
// 8. Server returned: "QUESTION_IMAGE_FILE_REQUIRED" ✗
//
// AFTER FIX:
// 1. FormData created with "file" field ✓
// 2. Content-Type set to "multipart/form-data" in generated code ✓
// 3. orvalMutator deletes Content-Type and explicitly passes FormData ✓
// 4. apiClient request interceptor also deletes Content-Type for FormData ✓
// 5. Axios/browser adds proper boundary ✓
// 6. Multer recognizes multipart request ✓
// 7. File is properly parsed ✓
// 8. Server uploads image successfully ✓
