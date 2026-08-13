# Security Specification - Gestor de Fornecedores

## Data Invariants
1. A user can only perform write operations (create, update, delete) on suppliers, lists, categories, reminders, and delivered products if their user status is 'approved'.
2. Only administrators can approve or deny user requests, or remove authorized users.
3. Users can create their own registration request exactly once.
4. CPFs must be exactly 11 digits.
5. All IDs must follow the standard ID pattern.
6. The user identified by the hardcoded admin CPF (05839352144) is automatically an admin.

## The Dirty Dozen Payloads (Access Denied Tests)

1. **Identity Theft**: Authenticated user 'A' tries to update user document 'B'.
2. **Privilege Escalation**: User 'A' tries to set their own `role` to 'admin'.
3. **Approval Bypass**: User 'A' (not admin) tries to set their own `status` to 'approved'.
4. **Data Poisoning**: Creating a supplier with a 2MB name.
5. **ID Poisoning**: Creating a category with a document ID containing malicious scripts.
6. **Orphaned Writes**: Creating a delivered product for a non-existent supplier.
7. **Terminal State Break**: Trying to change the `purchaseDate` of a delivered product after it has been marked as delivered (if we decide to lock it).
8. **PII Exposure**: Non-admin user tries to list all user documents (CPFs are PII).
9. **Fake Timestamp**: User tries to set a `requestDate` in the future or past, rather than using server time.
10. **Schema Break**: Sending a supplier without the 'products' array.
11. **Shadow Update**: Updating a supplier and adding a hidden 'is_verified' field not in the schema.
12. **Unauthorized Deletion**: User 'A' tries to delete user document 'B' (duplicate cleaning bypass).

## Test Runner Logic (firestore.rules.test.ts summary)
- Verify `allow list` on `authorized_users` fails for non-admins.
- Verify `allow update` on `role` fails for users updating themselves.
- Verify `allow write` on `suppliers` fails for `status: 'pending'` users.
- Verify `allow delete` on `authorized_users` works ONLY for admins.
