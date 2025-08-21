# KOI Testing Suite

Comprehensive testing for KOI functionality.

## Test Types

### Unit Tests (`__tests__/`)
- Component-level testing
- Mock data scenarios
- Edge case handling

### Integration Tests (`test-koi-queries.ts`)
- End-to-end query testing
- API endpoint validation
- Real data scenarios

### Performance Tests
- Load testing for query server
- Bulk sync performance
- Memory usage monitoring

## Running Tests

### All Tests
```bash
cd /opt/projects/plugin-knowledge-gaia

# Unit tests
bun test

# Integration tests
bun tests/test-koi-queries.ts

# Performance tests
bun tests/performance-test.ts
```

### Individual Test Suites
```bash
# Test specific functionality
bun test __tests__/utils.test.ts
bun test __tests__/action.test.ts
```

## Test Scenarios

### Basic Functionality
- ✅ Health check endpoint
- ✅ Statistics endpoint
- ✅ Query endpoint with various question types
- ✅ Agent mapping and deduplication
- ✅ Source classification

### Data Integration
- ✅ Real-time knowledge tracking
- ✅ Bulk sync operations
- ✅ Database consistency
- ✅ Processing status updates

### Error Handling
- ✅ Invalid queries
- ✅ Database connection issues
- ✅ Missing data scenarios
- ✅ Rate limiting

## Test Data

Tests use a combination of:
- **Mock data**: For unit tests
- **Sample data**: For integration tests  
- **Production data**: For performance tests (with care)

## Coverage Reports

Generate coverage reports with:
```bash
bun test --coverage
```

## Adding New Tests

1. Place unit tests in `__tests__/`
2. Place integration tests in `tests/`
3. Follow naming convention: `*.test.ts`
4. Include both positive and negative test cases
5. Document test scenarios in comments